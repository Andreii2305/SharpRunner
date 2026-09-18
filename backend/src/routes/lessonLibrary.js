const crypto = require("crypto");
const path = require("path");
const router = require("express").Router();
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const Classroom = require("../models/Classroom");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonAttachment = require("../models/ClassroomLessonAttachment");
const ClassroomLessonPlacement = require("../models/ClassroomLessonPlacement");
const ClassroomLessonVersion = require("../models/ClassroomLessonVersion");
const LessonTopic = require("../models/LessonTopic");
const { uploadLessonFiles, removeUploadedFiles, removeStoredFiles, lessonUploadPolicy } = require("../middleware/classroomLessonUpload");
const lessonStorage = require("../services/lessonFileStorageService");
const {
  normalizeString,
  normalizeUrl,
  normalizeTopics,
  publicationFields,
  derivePublicationStatus,
  safeImageMetadata,
  remapTopicImageBlocks,
} = require("../services/lessonBuilderService");

router.use(authMiddleware, requireRole("teacher", "admin"));

const topicInclude = {
  model: LessonTopic,
  as: "topics",
  separate: true,
  order: [["displayOrder", "ASC"], ["id", "ASC"]],
  include: [{
    model: ClassroomLessonAttachment,
    as: "images",
    attributes: ["id", "originalName", "mimeType", "sizeBytes", "displayOrder", "placement", "altText", "caption"],
    separate: true,
    order: [["displayOrder", "ASC"], ["id", "ASC"]],
  }],
};

const placementInclude = {
  model: ClassroomLessonPlacement,
  as: "placements",
  separate: true,
  include: [
    { model: Classroom, as: "classroom", attributes: ["id", "className", "section"] },
    { model: ClassroomLesson, as: "module", attributes: ["id", "title"] },
  ],
};

const attachmentInclude = {
  model: ClassroomLessonAttachment,
  as: "attachments",
  where: { topicId: null },
  required: false,
  attributes: ["id", "originalName", "mimeType", "sizeBytes", "displayOrder", "scanStatus"],
};

const findOwnedLesson = async (req, lessonId, options = {}) => ClassroomLesson.findOne({
  where: {
    id: lessonId,
    contentType: "lesson",
    ...(req.userRole === "admin" ? {} : { teacherId: req.userId }),
  },
  ...options,
});

const serializeLesson = (record) => {
  const lesson = record?.toJSON ? record.toJSON() : record;
  if (!lesson) return null;
  return {
    ...lesson,
    status: derivePublicationStatus(lesson),
    usageCount: lesson.placements?.length ?? 0,
    topics: (lesson.topics || []).sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    attachments: (lesson.attachments || []).sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
  };
};

const loadLesson = (req, lessonId) => findOwnedLesson(req, lessonId, {
  include: [topicInclude, placementInclude, attachmentInclude],
});

const validateMetadata = (body) => {
  const title = normalizeString(body.title, 160);
  if (!title) throw new Error("Lesson title is required");
  const description = normalizeString(body.description, 4000);
  const lessonNumber = body.lessonNumber === "" || body.lessonNumber == null ? null : Number.parseInt(body.lessonNumber, 10);
  if (lessonNumber != null && (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 9999)) throw new Error("Lesson number must be between 1 and 9999");
  return { title, description: description || null, lessonNumber, externalUrl: normalizeUrl(body.externalUrl) || null };
};

const nextStoredName = (originalName) => `${crypto.randomUUID()}${path.extname(originalName || "").slice(0, 20).toLowerCase()}`;

const deepCopyLesson = async (req, source, { title, placement: placementOptions } = {}) => {
  const createdStorage = [];
  try {
    return await sequelize.transaction(async (transaction) => {
      const copy = await ClassroomLesson.create({
        classroomId: null,
        teacherId: req.userRole === "admin" ? source.teacherId : req.userId,
        lessonNumber: source.lessonNumber,
        title: normalizeString(title, 160) || `${source.title} — Copy`.slice(0, 160),
        description: source.description,
        contentType: "lesson",
        externalUrl: source.externalUrl,
        isPublished: false,
        publishAt: null,
        version: 1,
        archivedAt: null,
      }, { transaction });

      const topicMap = new Map();
      const clonedTopics = new Map();
      for (const topic of source.topics || []) {
        const cloned = await LessonTopic.create({
          lessonId: copy.id,
          title: topic.title,
          displayOrder: topic.displayOrder,
          content: JSON.parse(JSON.stringify(topic.content || {})),
        }, { transaction });
        topicMap.set(topic.id, cloned.id);
        clonedTopics.set(topic.id, cloned);
      }

      const imageIdMap = new Map();
      for (const file of source.attachments || []) {
        const stored = await lessonStorage.cloneFile(file, `teachers/${copy.teacherId}/lessons/${copy.id}`);
        createdStorage.push(stored);
        const clonedFile = await ClassroomLessonAttachment.create({
          classroomId: null,
          lessonId: copy.id,
          topicId: file.topicId ? topicMap.get(file.topicId) : null,
          purpose: file.purpose || (file.topicId ? "topic_image" : "attachment"),
          placement: file.placement,
          altText: file.altText,
          caption: file.caption,
          originalName: file.originalName,
          storedName: nextStoredName(file.originalName),
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          displayOrder: file.displayOrder,
          ...stored,
        }, { transaction });
        if (file.topicId) imageIdMap.set(file.id, clonedFile.id);
      }

      for (const topic of source.topics || []) {
        if (!Array.isArray(topic.content?.blocks)) continue;
        const cloned = clonedTopics.get(topic.id);
        cloned.content = remapTopicImageBlocks(topic.content, imageIdMap);
        await cloned.save({ transaction });
      }

      await ClassroomLessonVersion.create({
        classroomId: null,
        lessonId: copy.id,
        editorId: req.userId,
        versionNumber: 1,
        snapshot: { title: copy.title, description: copy.description, lessonNumber: copy.lessonNumber, topics: source.topics || [] },
      }, { transaction });
      if (placementOptions) {
        await ClassroomLessonPlacement.create({
          lessonId: copy.id,
          classroomId: placementOptions.classroomId,
          moduleId: placementOptions.moduleId || null,
          displayOrder: await ClassroomLessonPlacement.count({
            where: { classroomId: placementOptions.classroomId },
            transaction,
          }),
        }, { transaction });
      }
      return copy;
    });
  } catch (error) {
    await Promise.all(createdStorage.map((stored) => lessonStorage.deleteFile(stored).catch(() => undefined)));
    throw error;
  }
};

router.get("/", async (req, res) => {
  try {
    const where = {
      contentType: "lesson",
      archivedAt: req.query.archived === "true" ? { [Op.ne]: null } : null,
      ...(req.userRole === "admin" && req.query.teacherId ? { teacherId: Number(req.query.teacherId) } : { teacherId: req.userId }),
    };
    const lessons = await ClassroomLesson.findAll({
      where,
      include: [placementInclude],
      order: [["updatedAt", "DESC"], ["id", "DESC"]],
    });
    const classrooms = await Classroom.findAll({
      where: req.userRole === "admin" ? {} : { teacherId: req.userId },
      attributes: ["id", "className", "section", "isActive"],
      order: [["className", "ASC"]],
    });
    return res.json({ lessons: lessons.map(serializeLesson), classrooms });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load the lesson library" });
  }
});

router.post("/", async (req, res) => {
  try {
    const metadata = validateMetadata(req.body || {});
    const publication = publicationFields(req.body?.status, req.body?.publishAt);
    const topics = normalizeTopics(req.body?.topics);
    const lesson = await sequelize.transaction(async (transaction) => {
      const created = await ClassroomLesson.create({
        classroomId: null,
        teacherId: req.userId,
        contentType: "lesson",
        ...metadata,
        ...publication,
        version: 1,
      }, { transaction });
      if (topics.length) await LessonTopic.bulkCreate(topics.map(({ id, clientId, ...topic }) => ({ ...topic, lessonId: created.id })), { transaction });
      await ClassroomLessonVersion.create({ classroomId: null, lessonId: created.id, editorId: req.userId, versionNumber: 1, snapshot: { ...metadata, ...publication, topics } }, { transaction });
      return created;
    });
    return res.status(201).json({ message: "Lesson created", lesson: serializeLesson(await loadLesson(req, lesson.id)) });
  } catch (error) {
    const status = /required|between|valid future/.test(error.message) ? 400 : 500;
    if (status === 500) console.error(error);
    return res.status(status).json({ message: status === 400 ? error.message : "Unable to create the lesson" });
  }
});

router.get("/:lessonId", async (req, res) => {
  try {
    const lesson = await loadLesson(req, Number(req.params.lessonId));
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    return res.json({ lesson: serializeLesson(lesson), uploadPolicy: lessonUploadPolicy });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load the lesson" });
  }
});

router.put("/:lessonId", async (req, res) => {
  let filesToDelete = [];
  try {
    const lessonId = Number(req.params.lessonId);
    const lesson = await findOwnedLesson(req, lessonId);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    const expectedVersion = Number(req.body?.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== lesson.version) {
      return res.status(409).json({ message: "This lesson was updated elsewhere. Refresh before continuing.", currentVersion: lesson.version });
    }
    const metadata = validateMetadata(req.body || {});
    const publication = publicationFields(req.body?.status, req.body?.publishAt);
    const topics = normalizeTopics(req.body?.topics);

    await sequelize.transaction(async (transaction) => {
      const lockedLesson = await ClassroomLesson.findOne({
        where: { id: lessonId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!lockedLesson || lockedLesson.version !== expectedVersion) {
        const conflict = new Error("This lesson was updated elsewhere. Refresh before continuing.");
        conflict.code = "LESSON_VERSION_CONFLICT";
        conflict.currentVersion = lockedLesson?.version;
        throw conflict;
      }
      const existingTopics = await LessonTopic.findAll({ where: { lessonId }, transaction, lock: transaction.LOCK.UPDATE });
      const existingIds = new Set(existingTopics.map((topic) => topic.id));
      const keptIds = new Set(topics.map((topic) => topic.id).filter(Boolean));
      for (const topic of topics) {
        if (topic.id) {
          if (!existingIds.has(topic.id)) throw new Error("A topic does not belong to this lesson");
          await LessonTopic.update({ title: topic.title, displayOrder: topic.displayOrder, content: topic.content }, { where: { id: topic.id, lessonId }, transaction });
        } else {
          await LessonTopic.create({ lessonId, title: topic.title, displayOrder: topic.displayOrder, content: topic.content }, { transaction });
        }
      }
      const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
      if (removedIds.length) {
        filesToDelete = await ClassroomLessonAttachment.findAll({ where: { lessonId, topicId: { [Op.in]: removedIds } }, transaction });
        await LessonTopic.destroy({ where: { lessonId, id: { [Op.in]: removedIds } }, transaction });
      }
      await ClassroomLessonVersion.create({
        classroomId: lockedLesson.classroomId,
        lessonId,
        editorId: req.userId,
        versionNumber: lockedLesson.version,
        snapshot: { title: lockedLesson.title, description: lockedLesson.description, lessonNumber: lockedLesson.lessonNumber, isPublished: lockedLesson.isPublished, publishAt: lockedLesson.publishAt, topics: existingTopics },
      }, { transaction });
      Object.assign(lockedLesson, metadata, publication, { version: lockedLesson.version + 1 });
      await lockedLesson.save({ transaction });
    });
    await Promise.all(filesToDelete.map((file) => lessonStorage.deleteFile(file).catch(() => undefined)));
    return res.json({ message: "Lesson saved", lesson: serializeLesson(await loadLesson(req, lessonId)) });
  } catch (error) {
    if (error.code === "LESSON_VERSION_CONFLICT") {
      return res.status(409).json({ message: error.message, currentVersion: error.currentVersion });
    }
    const status = /required|between|valid future|does not belong/.test(error.message) ? 400 : 500;
    if (status === 500) console.error(error);
    return res.status(status).json({ message: status === 400 ? error.message : "Your lesson could not be saved" });
  }
});

router.post("/:lessonId/duplicate", async (req, res) => {
  try {
    const source = await findOwnedLesson(req, Number(req.params.lessonId), {
      include: [topicInclude, { model: ClassroomLessonAttachment, as: "attachments" }],
    });
    if (!source) return res.status(404).json({ message: "Lesson not found" });
    const copy = await deepCopyLesson(req, source, { title: req.body?.title });
    return res.status(201).json({ message: "Independent lesson copy created", lesson: serializeLesson(await loadLesson(req, copy.id)) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "The lesson could not be copied" });
  }
});

router.post("/:lessonId/topics/:topicId/duplicate", async (req, res) => {
  const createdStorage = [];
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    const topic = await LessonTopic.findOne({ where: { id: Number(req.params.topicId), lessonId: lesson.id }, include: [{ model: ClassroomLessonAttachment, as: "images" }] });
    if (!topic) return res.status(404).json({ message: "Topic not found" });
    const duplicate = await sequelize.transaction(async (transaction) => {
      await LessonTopic.increment("displayOrder", { by: 1, where: { lessonId: lesson.id, displayOrder: { [Op.gt]: topic.displayOrder } }, transaction });
      const created = await LessonTopic.create({ lessonId: lesson.id, title: `${topic.title} — Copy`.slice(0, 180), displayOrder: topic.displayOrder + 1, content: JSON.parse(JSON.stringify(topic.content)) }, { transaction });
      const imageIdMap = new Map();
      for (const image of topic.images || []) {
        const stored = await lessonStorage.cloneFile(image, `teachers/${lesson.teacherId}/lessons/${lesson.id}/topics/${created.id}`);
        createdStorage.push(stored);
        const clonedImage = await ClassroomLessonAttachment.create({
          classroomId: null, lessonId: lesson.id, topicId: created.id, purpose: "topic_image",
          placement: image.placement, altText: image.altText, caption: image.caption,
          originalName: image.originalName, storedName: nextStoredName(image.originalName), mimeType: image.mimeType,
          sizeBytes: image.sizeBytes, displayOrder: image.displayOrder, ...stored,
        }, { transaction });
        imageIdMap.set(image.id, clonedImage.id);
      }
      created.content = remapTopicImageBlocks(topic.content, imageIdMap);
      await created.save({ transaction });
      lesson.version += 1;
      await lesson.save({ transaction });
      return created;
    });
    return res.status(201).json({ message: "Topic duplicated", topicId: duplicate.id, lesson: serializeLesson(await loadLesson(req, lesson.id)) });
  } catch (error) {
    await Promise.all(createdStorage.map((stored) => lessonStorage.deleteFile(stored).catch(() => undefined)));
    console.error(error);
    return res.status(500).json({ message: "The topic could not be duplicated" });
  }
});

router.post("/:lessonId/topics/:topicId/images", uploadLessonFiles, async (req, res) => {
  const storedFiles = [];
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    const topic = lesson && await LessonTopic.findOne({ where: { id: Number(req.params.topicId), lessonId: lesson.id } });
    if (!lesson || !topic) { await removeUploadedFiles(req.files); return res.status(404).json({ message: "Lesson topic not found" }); }
    if (!req.files?.length || req.files.some((file) => !String(file.mimetype).startsWith("image/"))) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ message: "Choose one or more supported image files" });
    }
    const metadata = safeImageMetadata(req.body);
    const images = await sequelize.transaction(async (transaction) => {
      const currentCount = await ClassroomLessonAttachment.count({ where: { topicId: topic.id }, transaction });
      const createdImages = [];
      for (const [index, file] of req.files.entries()) {
        const stored = await lessonStorage.uploadFile(file, `teachers/${lesson.teacherId}/lessons/${lesson.id}/topics/${topic.id}`);
        storedFiles.push(stored);
        createdImages.push(await ClassroomLessonAttachment.create({
          classroomId: null, lessonId: lesson.id, topicId: topic.id, purpose: "topic_image", ...metadata,
          originalName: file.originalname.slice(0, 255), storedName: file.filename, mimeType: file.mimetype,
          sizeBytes: file.size, displayOrder: currentCount + index, ...stored,
        }, { transaction }));
      }
      lesson.version += 1;
      await lesson.save({ transaction });
      return createdImages;
    });
    await removeUploadedFiles(req.files);
    return res.status(201).json({ message: "Topic images added", images: images.map((image) => ({ id: image.id, originalName: image.originalName, mimeType: image.mimeType, sizeBytes: Number(image.sizeBytes), displayOrder: image.displayOrder, placement: image.placement, altText: image.altText, caption: image.caption })), version: lesson.version });
  } catch (error) {
    await removeUploadedFiles(req.files);
    await Promise.all(storedFiles.map((stored) => lessonStorage.deleteFile(stored).catch(() => undefined)));
    console.error(error);
    return res.status(500).json({ message: "Image upload failed. Please try again." });
  }
});

router.patch("/:lessonId/topics/:topicId/images/:imageId", async (req, res) => {
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    const image = lesson && await ClassroomLessonAttachment.findOne({ where: { id: Number(req.params.imageId), lessonId: lesson.id, topicId: Number(req.params.topicId), purpose: "topic_image" } });
    if (!lesson || !image) return res.status(404).json({ message: "Topic image not found" });
    Object.assign(image, safeImageMetadata(req.body));
    if (Number.isInteger(Number(req.body.displayOrder))) image.displayOrder = Math.max(0, Number(req.body.displayOrder));
    await image.save();
    return res.json({ message: "Image updated" });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Unable to update the image" }); }
});

router.delete("/:lessonId/topics/:topicId/images/:imageId", async (req, res) => {
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    const image = lesson && await ClassroomLessonAttachment.findOne({ where: { id: Number(req.params.imageId), lessonId: lesson.id, topicId: Number(req.params.topicId), purpose: "topic_image" } });
    if (!lesson || !image) return res.status(404).json({ message: "Topic image not found" });
    await image.destroy();
    await lessonStorage.deleteFile(image);
    await removeStoredFiles([image.storedName]);
    lesson.version += 1; await lesson.save();
    return res.json({ message: "Image removed", version: lesson.version });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Unable to remove the image" }); }
});

router.post("/:lessonId/attachments", uploadLessonFiles, async (req, res) => {
  const storedFiles = [];
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    if (!lesson) { await removeUploadedFiles(req.files); return res.status(404).json({ message: "Lesson not found" }); }
    if (!req.files?.length) return res.status(400).json({ message: "Choose at least one file" });
    await sequelize.transaction(async (transaction) => {
      const currentCount = await ClassroomLessonAttachment.count({ where: { lessonId: lesson.id, topicId: null }, transaction });
      for (const [index, file] of req.files.entries()) {
        const stored = await lessonStorage.uploadFile(file, `teachers/${lesson.teacherId}/lessons/${lesson.id}/attachments`);
        storedFiles.push(stored);
        await ClassroomLessonAttachment.create({
          classroomId: null, lessonId: lesson.id, topicId: null, purpose: "attachment",
          originalName: file.originalname.slice(0, 255), storedName: file.filename, mimeType: file.mimetype,
          sizeBytes: file.size, displayOrder: currentCount + index, ...stored,
        }, { transaction });
      }
      lesson.version += 1;
      await lesson.save({ transaction });
    });
    await removeUploadedFiles(req.files);
    return res.status(201).json({ message: "Resources added", lesson: serializeLesson(await loadLesson(req, lesson.id)) });
  } catch (error) {
    await removeUploadedFiles(req.files);
    await Promise.all(storedFiles.map((stored) => lessonStorage.deleteFile(stored).catch(() => undefined)));
    console.error(error);
    return res.status(500).json({ message: "Resources could not be uploaded" });
  }
});

router.delete("/:lessonId/attachments/:attachmentId", async (req, res) => {
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    const attachment = lesson && await ClassroomLessonAttachment.findOne({
      where: { id: Number(req.params.attachmentId), lessonId: lesson.id, topicId: null },
    });
    if (!lesson || !attachment) return res.status(404).json({ message: "Resource not found" });
    await attachment.destroy();
    await lessonStorage.deleteFile(attachment);
    await removeStoredFiles([attachment.storedName]);
    lesson.version += 1;
    await lesson.save();
    return res.json({ message: "Resource removed", version: lesson.version });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to remove the resource" });
  }
});

router.post("/:lessonId/placements", async (req, res) => {
  try {
    const source = await findOwnedLesson(req, Number(req.params.lessonId), { include: [topicInclude, { model: ClassroomLessonAttachment, as: "attachments" }] });
    if (!source) return res.status(404).json({ message: "Lesson not found" });
    const classroomId = Number(req.body?.classroomId);
    const classroom = await Classroom.findOne({ where: { id: classroomId, ...(req.userRole === "admin" ? {} : { teacherId: req.userId }) } });
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });
    const moduleId = req.body?.moduleId ? Number(req.body.moduleId) : null;
    if (moduleId && !await ClassroomLesson.findOne({ where: { id: moduleId, classroomId, contentType: "module" } })) return res.status(400).json({ message: "Selected module does not belong to this classroom" });
    const mode = req.body?.mode === "reuse" ? "reuse" : "copy";
    if (mode === "copy") {
      const lesson = await deepCopyLesson(req, source, { placement: { classroomId, moduleId } });
      const placement = await ClassroomLessonPlacement.findOne({ where: { lessonId: lesson.id, classroomId } });
      return res.status(201).json({ message: "Independent copy added to classroom", lessonId: lesson.id, placement });
    }
    const lesson = source;
    const [placement, created] = await ClassroomLessonPlacement.findOrCreate({
      where: { lessonId: lesson.id, classroomId },
      defaults: { moduleId, displayOrder: await ClassroomLessonPlacement.count({ where: { classroomId } }) },
    });
    if (!created) {
      placement.moduleId = moduleId;
      await placement.save();
    }
    return res.status(created ? 201 : 200).json({
      message: created ? "Shared lesson added to classroom" : moduleId ? "Lesson moved to the selected module" : "Lesson moved out of its module",
      lessonId: lesson.id,
      placement,
    });
  } catch (error) { console.error(error); return res.status(500).json({ message: "The lesson could not be added to the classroom" }); }
});

router.delete("/:lessonId/placements/:classroomId", async (req, res) => {
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    const classroom = await Classroom.findOne({ where: { id: Number(req.params.classroomId), ...(req.userRole === "admin" ? {} : { teacherId: req.userId }) } });
    if (!lesson || !classroom) return res.status(404).json({ message: "Placement not found" });
    const removed = await ClassroomLessonPlacement.destroy({ where: { lessonId: lesson.id, classroomId: classroom.id } });
    return removed ? res.json({ message: "Lesson removed from classroom" }) : res.status(404).json({ message: "Placement not found" });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Unable to remove the lesson from this classroom" }); }
});

router.patch("/:lessonId/archive", async (req, res) => {
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    lesson.archivedAt = req.body?.archived === false ? null : new Date();
    await lesson.save();
    return res.json({ message: lesson.archivedAt ? "Lesson archived" : "Lesson restored" });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Unable to update the lesson" }); }
});

router.delete("/:lessonId", async (req, res) => {
  try {
    const lesson = await findOwnedLesson(req, Number(req.params.lessonId));
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    const usageCount = await ClassroomLessonPlacement.count({ where: { lessonId: lesson.id } });
    if (usageCount) return res.status(409).json({ message: `This lesson is currently used in ${usageCount} classroom${usageCount === 1 ? "" : "s"}. Remove those placements or archive it instead.`, usageCount });
    const files = await ClassroomLessonAttachment.findAll({ where: { lessonId: lesson.id } });
    await lesson.destroy();
    await Promise.all(files.map((file) => lessonStorage.deleteFile(file).catch(() => undefined)));
    await removeStoredFiles(files.map((file) => file.storedName));
    return res.json({ message: "Lesson permanently deleted" });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Unable to delete the lesson" }); }
});

module.exports = router;
