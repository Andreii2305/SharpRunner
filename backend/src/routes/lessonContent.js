const router = require("express").Router();
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");
const { getLessonContentSeed } = require("../services/lessonContentService");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonAttachment = require("../models/ClassroomLessonAttachment");
const ClassroomLessonProgress = require("../models/ClassroomLessonProgress");
const ClassroomLessonSubmission = require("../models/ClassroomLessonSubmission");
const ClassroomLessonSubmissionAttachment = require("../models/ClassroomLessonSubmissionAttachment");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const ClassroomLessonPlacement = require("../models/ClassroomLessonPlacement");
const LessonTopic = require("../models/LessonTopic");
const fs = require("fs");
const path = require("path");
const { uploadDirectory, uploadLessonFiles, removeUploadedFiles, lessonUploadPolicy } = require("../middleware/classroomLessonUpload");
const lessonStorage = require("../services/lessonFileStorageService");
const { isOfficeDocument, convertOfficeToPdf } = require("../services/officePreviewService");
const { extensionAllowed } = require("../services/fileSecurityService");
const { isStudentAssigned, submissionPolicyError } = require("../services/classroomLessonPolicyService");
const { findPrimaryActiveMembership } = require("../services/studentClassService");
const customLessonLifecycle = require("../services/customLessonLifecycleService");
const customLessonAssessmentAccess = require("../services/customLessonAssessmentAccessService");

const visibleLessonWhere = (classroomId) => ({
  classroomId,
  archivedAt: null,
  isPublished: true,
  [Op.or]: [{ publishAt: null }, { publishAt: { [Op.lte]: new Date() } }],
});

const sanitizeSubmission = (submission, { releaseFeedback = true } = {}) => submission ? {
  id: submission.id, comment: submission.comment, status: submission.status,
  submittedAt: submission.submittedAt, attemptCount: submission.attemptCount,
  grade: releaseFeedback ? submission.grade : null, feedback: releaseFeedback ? submission.feedback : null,
  rubricScores: releaseFeedback ? submission.rubricScores : [], gradedAt: releaseFeedback ? submission.gradedAt : null,
  feedbackPending: !releaseFeedback && ["graded", "resubmit"].includes(submission.status),
  attachments: (submission.attachments || []).map((file) => ({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: Number(file.sizeBytes) })),
} : null;
const isAssignedToStudent = isStudentAssigned;
const isLessonAccessError = (error) => (
  error instanceof customLessonLifecycle.LessonLifecycleError
  || error instanceof customLessonAssessmentAccess.CustomLessonAssessmentAccessError
);

const findStudentPlacement = async (lesson, studentId, requestedClassroomId = null) => {
  if (!lesson) return null;
  const memberships = await ClassroomMembership.findAll({
    where: { studentId, status: "active" },
    attributes: ["classroomId"],
  });
  const classroomIds = memberships.map((membership) => membership.classroomId);
  if (!classroomIds.length) return null;
  const preferredClassroomId = Number.parseInt(requestedClassroomId, 10);
  if (requestedClassroomId != null && (!Number.isInteger(preferredClassroomId) || !classroomIds.includes(preferredClassroomId))) {
    return null;
  }
  let eligibleClassroomIds;
  if (Number.isInteger(preferredClassroomId)) {
    eligibleClassroomIds = [preferredClassroomId];
  } else if (lesson.classroomId && classroomIds.includes(lesson.classroomId)) {
    eligibleClassroomIds = [lesson.classroomId];
  } else if (classroomIds.length === 1) {
    eligibleClassroomIds = classroomIds;
  } else {
    return null;
  }
  const placement = await ClassroomLessonPlacement.findOne({
    where: { lessonId: lesson.id, classroomId: { [Op.in]: eligibleClassroomIds }, archivedAt: null },
    order: [["createdAt", "ASC"]],
  });
  if (placement) return placement;
  return eligibleClassroomIds.includes(lesson.classroomId)
    ? { lessonId: lesson.id, classroomId: lesson.classroomId, moduleId: lesson.moduleId }
    : null;
};

const authorizeStudentContentDelivery = async ({
  lesson,
  studentId,
  requestedClassroomId,
  recordAccess = true,
  expectedContentVersion = null,
}) => {
  const placement = await findStudentPlacement(lesson, studentId, requestedClassroomId);
  if (!placement) return null;
  if (!placement.id) return placement;
  return sequelize.transaction(async (transaction) => {
    const access = await customLessonAssessmentAccess.requireStudentContentAccess({
      lessonId: lesson.id,
      placementId: placement.id,
      classroomId: placement.classroomId,
      studentId,
      transaction,
    });
    const authoritativePlacement = access.placement;
    const authoritativeVersion = Number(authoritativePlacement.lesson.contentVersion);
    if (expectedContentVersion != null && authoritativeVersion !== Number(expectedContentVersion)) {
      throw new customLessonLifecycle.LessonLifecycleError(
        409,
        "STALE_LESSON_REVISION",
        "This lesson changed while its content was loading. Refresh to view the current revision.",
        { currentVersion: authoritativeVersion },
      );
    }
    if (recordAccess) {
      await customLessonLifecycle.recordContentAccess({
        placement: authoritativePlacement,
        lesson: authoritativePlacement.lesson,
        studentId,
        transaction,
      });
    }
    return authoritativePlacement;
  });
};

const placementDiscoveryItem = ({ placement, access }) => {
  const lesson = placement.lesson?.toJSON ? placement.lesson.toJSON() : placement.lesson;
  return {
    id: lesson.id,
    title: lesson.title,
    lessonNumber: lesson.lessonNumber ?? null,
    contentType: lesson.contentType,
    classroomId: placement.classroomId,
    moduleId: placement.moduleId,
    dueAt: lesson.dueAt ?? null,
    allowSubmissions: Boolean(lesson.allowSubmissions),
    createdAt: lesson.createdAt,
    description: null,
    externalUrl: null,
    attachments: [],
    contentAvailable: access.allowed,
    assessmentGate: access.gate,
  };
};

const structuredLessonIncludes = [
  {
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
  },
  {
    model: ClassroomLessonAttachment,
    as: "attachments",
    where: { topicId: null },
    required: false,
    attributes: ["id", "originalName", "mimeType", "sizeBytes", "displayOrder"],
  },
];

router.get("/", authMiddleware, async (req, res) => {
  try {
    const payload = getLessonContentSeed();
    if (req.userRole !== "student") return res.json({ ...payload, classroomLessons: [] });

    const membership = await findPrimaryActiveMembership(req.userId);
    const directLessons = membership
      ? await ClassroomLesson.findAll({
          where: visibleLessonWhere(membership.classroomId),
          attributes: ["id", "title", "description", "contentType", "moduleId", "externalUrl", "dueAt", "allowSubmissions", "assignedStudentIds", "createdAt"],
          include: [{
            model: ClassroomLessonAttachment,
            as: "attachments",
            where: { topicId: null },
            required: false,
            attributes: ["id", "originalName", "mimeType", "sizeBytes"],
          }],
          order: [["createdAt", "DESC"]],
        })
      : [];
    const placements = membership ? await ClassroomLessonPlacement.findAll({
      where: { classroomId: membership.classroomId, archivedAt: null },
      include: [{
        model: ClassroomLesson,
        as: "lesson",
        required: true,
        where: {
          contentType: "lesson",
          archivedAt: null,
          isPublished: true,
          [Op.or]: [{ publishAt: null }, { publishAt: { [Op.lte]: new Date() } }],
        },
        include: [{ model: ClassroomLessonAttachment, as: "attachments", where: { topicId: null }, required: false, attributes: ["id", "originalName", "mimeType", "sizeBytes"] }],
      }],
      order: [["displayOrder", "ASC"], ["id", "ASC"]],
    }) : [];
    const byId = new Map();
    for (const row of directLessons) if (isAssignedToStudent(row, req.userId)) byId.set(row.id, row.toJSON ? row.toJSON() : row);
    if (placements.length) {
      await sequelize.transaction(async (transaction) => {
        for (const placement of placements) {
          const item = placement.lesson?.toJSON ? placement.lesson.toJSON() : placement.lesson;
          if (!item || !isAssignedToStudent(item, req.userId)) continue;
          const access = await customLessonAssessmentAccess.evaluateStudentContentAccess({
            lessonId: item.id,
            placementId: placement.id,
            classroomId: placement.classroomId,
            studentId: req.userId,
            transaction,
          });
          byId.set(item.id, placementDiscoveryItem({ placement, access }));
        }
      });
    }
    return res.json({ ...payload, classroomLessons: [...byId.values()] });
  } catch (error) {
    if (isLessonAccessError(error)) {
      return res.status(error.status).json({ message: error.message, code: error.code, ...error.details });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classroom-lessons/:lessonId", authMiddleware, async (req, res) => {
  try {
    const lessonId = Number.parseInt(req.params.lessonId, 10);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return res.status(400).json({ message: "Invalid lesson id" });
    }

    const lesson = await ClassroomLesson.findByPk(lessonId, {
      attributes: ["id", "classroomId", "teacherId", "lessonNumber", "title", "description", "contentType", "moduleId", "externalUrl", "dueAt", "isPublished", "publishAt", "archivedAt", "allowSubmissions", "maxScore", "rubric", "feedbackReleaseAt", "allowLateSubmissions", "maxAttempts", "allowedFileTypes", "maxFileSizeMb", "assignedStudentIds", "version", "contentVersion", "createdAt", "updatedAt"],
      include: structuredLessonIncludes,
    });
    const currentlyVisible = !lesson?.archivedAt && lesson?.isPublished && (!lesson.publishAt || new Date(lesson.publishAt) <= new Date());
    if (!lesson || (req.userRole === "student" && (!currentlyVisible || !isAssignedToStudent(lesson, req.userId)))) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    let placement = null;
    let allowed = req.userRole === "admin";
    if (req.userRole === "teacher") {
      allowed = lesson.teacherId === req.userId || Boolean(lesson.classroomId && await Classroom.findOne({ where: { id: lesson.classroomId, teacherId: req.userId }, attributes: ["id"] }));
    } else if (req.userRole === "student") {
      placement = await findStudentPlacement(lesson, req.userId, req.query.classroomId);
      allowed = Boolean(placement);
    }
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    let progress = null;
    let submission = null;
    let readingAcknowledgement = null;
    if (req.userRole === "student") {
      await sequelize.transaction(async (transaction) => {
        let authoritativePlacement = placement;
        if (placement.id) {
          const access = await customLessonAssessmentAccess.requireStudentContentAccess({
            lessonId,
            placementId: placement.id,
            classroomId: placement.classroomId,
            studentId: req.userId,
            transaction,
          });
          authoritativePlacement = access.placement;
          if (Number(authoritativePlacement.lesson.contentVersion) !== Number(lesson.contentVersion)) {
            throw new customLessonLifecycle.LessonLifecycleError(
              409,
              "STALE_LESSON_REVISION",
              "This lesson changed while it was loading. Refresh to view the current revision.",
              { currentVersion: Number(authoritativePlacement.lesson.contentVersion) },
            );
          }
          await customLessonLifecycle.recordContentAccess({
            placement: authoritativePlacement,
            lesson: authoritativePlacement.lesson,
            studentId: req.userId,
            transaction,
          });
          readingAcknowledgement = {
            placementId: authoritativePlacement.id,
            lessonVersion: Number(authoritativePlacement.lesson.contentVersion),
          };
        }
        [progress] = await ClassroomLessonProgress.findOrCreate({
          where: { classroomId: authoritativePlacement.classroomId, lessonId, studentId: req.userId },
          defaults: { classroomId: authoritativePlacement.classroomId, viewedAt: new Date(), completedAt: null },
          transaction,
        });
        if (!progress.viewedAt) {
          progress.viewedAt = new Date();
          await progress.save({ transaction });
        }
      });
      submission = await ClassroomLessonSubmission.findOne({
        where: { lessonId, studentId: req.userId },
        include: [{ model: ClassroomLessonSubmissionAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes"] }],
      });
    }
    lesson.attachments?.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
    const releaseFeedback = !lesson.feedbackReleaseAt || new Date(lesson.feedbackReleaseAt) <= new Date();
    const lessonPayload = lesson.toJSON ? lesson.toJSON() : lesson;
    if (placement) {
      lessonPayload.classroomId = placement.classroomId;
      lessonPayload.moduleId = placement.moduleId;
    }
    const contextClassroomId = placement?.classroomId ?? lessonPayload.classroomId;
    const contextModuleId = placement?.moduleId ?? lessonPayload.moduleId;
    const [contextClassroom, contextModule] = await Promise.all([
      contextClassroomId ? Classroom.findByPk(contextClassroomId, { attributes: ["id", "className", "section"] }) : null,
      contextModuleId ? ClassroomLesson.findOne({ where: { id: contextModuleId, classroomId: contextClassroomId, contentType: "module" }, attributes: ["id", "title"] }) : null,
    ]);
    lessonPayload.maxFileSizeMb = Math.min(lessonPayload.maxFileSizeMb || lessonUploadPolicy.maxFileSizeMb, lessonUploadPolicy.maxFileSizeMb);
    const responsePayload = {
      lesson: lessonPayload,
      context: {
        classroom: contextClassroom ? { id: contextClassroom.id, className: contextClassroom.className, section: contextClassroom.section } : null,
        module: contextModule ? { id: contextModule.id, title: contextModule.title } : null,
      },
      progress,
      submission: sanitizeSubmission(submission, { releaseFeedback }),
      uploadPolicy: lessonUploadPolicy,
    };
    if (readingAcknowledgement) responsePayload.readingAcknowledgement = readingAcknowledgement;
    return res.json(responsePayload);
  } catch (error) {
    if (isLessonAccessError(error)) {
      return res.status(error.status).json({ message: error.message, code: error.code, ...error.details });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/classroom-lessons/:lessonId/placements/:placementId/reading-acknowledgement", authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== "student") {
      return res.status(403).json({ message: "Student access required" });
    }
    const lessonId = Number(req.params.lessonId);
    const placementId = Number(req.params.placementId);
    const classroomId = Number(req.body?.classroomId);
    const lessonVersion = Number(req.body?.lessonVersion);
    if (![lessonId, placementId, classroomId, lessonVersion].every((value) => Number.isSafeInteger(value) && value > 0)) {
      return res.status(400).json({ message: "Valid lesson, placement, classroom, and revision are required" });
    }
    await sequelize.transaction(async (transaction) => (
      customLessonAssessmentAccess.requireStudentContentAccess({
        lessonId,
        placementId,
        classroomId,
        studentId: req.userId,
        transaction,
      })
    ));
    const { completion, created } = await customLessonLifecycle.acknowledgeReading({
      lessonId,
      placementId,
      classroomId,
      studentId: req.userId,
      lessonVersion,
    });
    return res.status(created ? 201 : 200).json({
      message: created ? "Reading acknowledged" : "Reading was already acknowledged",
      readingCompletion: {
        lessonVersion: Number(completion.lessonVersion),
        completedAt: completion.completedAt,
      },
    });
  } catch (error) {
    if (isLessonAccessError(error)) {
      return res.status(error.status).json({ message: error.message, code: error.code, ...error.details });
    }
    console.error(error);
    return res.status(500).json({ message: "Unable to record reading acknowledgement" });
  }
});

router.get("/classroom-files/:fileId", authMiddleware, async (req, res) => {
  try {
    const fileId = Number.parseInt(req.params.fileId, 10);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      return res.status(400).json({ message: "Invalid file id" });
    }

    const attachment = await ClassroomLessonAttachment.findByPk(fileId, {
      attributes: ["id", "classroomId", "originalName", "storedName", "mimeType", "sizeBytes", "data", "storageProvider", "storageKey"],
      include: [{ model: ClassroomLesson, as: "lesson", required: true, attributes: ["id", "classroomId", "teacherId", "contentType", "contentVersion", "isPublished", "publishAt", "archivedAt", "assignedStudentIds"] }],
    });
    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    let allowed = req.userRole === "admin";
    let authorizedContentVersion = null;
    if (req.userRole === "teacher") {
      allowed = attachment.lesson?.teacherId === req.userId || Boolean(attachment.classroomId && await Classroom.findOne({ where: { id: attachment.classroomId, teacherId: req.userId }, attributes: ["id"] }));
    } else if (req.userRole === "student") {
      const visible = !attachment.lesson?.archivedAt
        && attachment.lesson?.isPublished
        && (!attachment.lesson.publishAt || new Date(attachment.lesson.publishAt) <= new Date());
      const placement = visible && await authorizeStudentContentDelivery({
        lesson: attachment.lesson,
        studentId: req.userId,
        requestedClassroomId: req.query.classroomId,
        recordAccess: false,
      });
      allowed = visible && Boolean(placement);
      authorizedContentVersion = placement?.lesson?.contentVersion ?? null;
    }
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    if (req.userRole === "student" && (!attachment.lesson?.isPublished || !isAssignedToStudent(attachment.lesson, req.userId) || (attachment.lesson.publishAt && new Date(attachment.lesson.publishAt) > new Date()))) {
      return res.status(404).json({ message: "Attachment not found" });
    }
    const filePath = path.join(uploadDirectory, path.basename(attachment.storedName));
    let storedData = await lessonStorage.readFile(attachment);
    if (!storedData) {
      try {
        storedData = await fs.promises.readFile(filePath);
      } catch (error) {
        if (error?.code === "ENOENT") return res.status(404).json({ message: "File not found" });
        throw error;
      }
    }
    if (req.userRole === "student") {
      await authorizeStudentContentDelivery({
        lesson: attachment.lesson,
        studentId: req.userId,
        requestedClassroomId: req.query.classroomId,
        expectedContentVersion: authorizedContentVersion,
      });
    }
    const inlineType = /^(video\/|audio\/|image\/|application\/pdf$|text\/)/i.test(attachment.mimeType);
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${inlineType ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
    res.setHeader("Content-Length", String(storedData.length));
    return res.send(storedData);
  } catch (error) {
    if (isLessonAccessError(error)) {
      return res.status(error.status === 404 ? 403 : error.status).json({ message: "Access denied", code: error.code, ...error.details });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classroom-files/:fileId/preview", authMiddleware, async (req, res) => {
  try {
    const attachment = await ClassroomLessonAttachment.findByPk(Number.parseInt(req.params.fileId, 10), {
      include: [{ model: ClassroomLesson, as: "lesson", required: true, attributes: ["id", "classroomId", "teacherId", "contentType", "contentVersion", "isPublished", "publishAt", "archivedAt", "assignedStudentIds"] }],
    });
    if (!attachment || !isOfficeDocument(attachment.originalName)) return res.status(404).json({ message: "Preview not found" });
    let allowed = req.userRole === "admin";
    let authorizedContentVersion = null;
    if (req.userRole === "teacher") allowed = attachment.lesson.teacherId === req.userId || Boolean(attachment.classroomId && await Classroom.findOne({ where: { id: attachment.classroomId, teacherId: req.userId } }));
    if (req.userRole === "student") {
      const visible = !attachment.lesson.archivedAt && attachment.lesson.isPublished && isAssignedToStudent(attachment.lesson, req.userId) && (!attachment.lesson.publishAt || new Date(attachment.lesson.publishAt) <= new Date());
      const placement = visible && await authorizeStudentContentDelivery({
        lesson: attachment.lesson,
        studentId: req.userId,
        requestedClassroomId: req.query.classroomId,
        recordAccess: false,
      });
      allowed = visible && Boolean(placement);
      authorizedContentVersion = placement?.lesson?.contentVersion ?? null;
    }
    if (!allowed) return res.status(403).json({ message: "Access denied" });
    let data = await lessonStorage.readFile(attachment);
    if (!data) {
      const filePath = path.join(uploadDirectory, path.basename(attachment.storedName));
      try {
        data = await fs.promises.readFile(filePath);
      } catch (error) {
        if (error?.code === "ENOENT") return res.status(404).json({ message: "Preview not found" });
        throw error;
      }
    }
    const pdf = data && await convertOfficeToPdf(data, attachment.originalName);
    if (!pdf) return res.status(415).json({ message: "Office preview requires LibreOffice on the server" });
    if (req.userRole === "student") {
      await authorizeStudentContentDelivery({
        lesson: attachment.lesson,
        studentId: req.userId,
        requestedClassroomId: req.query.classroomId,
        expectedContentVersion: authorizedContentVersion,
      });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(`${attachment.originalName}.pdf`)}`);
    return res.send(pdf);
  } catch (error) {
    if (isLessonAccessError(error)) return res.status(error.status === 404 ? 403 : error.status).json({ message: "Access denied", code: error.code, ...error.details });
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/classroom-lessons/:lessonId/completion", authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== "student") return res.status(403).json({ message: "Student access required" });
    const lessonId = Number.parseInt(req.params.lessonId, 10);
    const lesson = await ClassroomLesson.findByPk(lessonId);
    const placement = lesson && await findStudentPlacement(lesson, req.userId, req.body?.classroomId ?? req.query.classroomId);
    if (!lesson || lesson.archivedAt || !placement || !isAssignedToStudent(lesson, req.userId) || !["module", "lesson"].includes(lesson.contentType) || !lesson.isPublished || (lesson.publishAt && new Date(lesson.publishAt) > new Date())) return res.status(404).json({ message: "Lesson not found" });
    const progress = await sequelize.transaction(async (transaction) => {
      let authoritativePlacement = placement;
      if (placement.id) {
        const access = await customLessonAssessmentAccess.requireStudentContentAccess({
          lessonId,
          placementId: placement.id,
          classroomId: placement.classroomId,
          studentId: req.userId,
          transaction,
        });
        authoritativePlacement = access.placement;
      } else {
        const lockedLesson = await ClassroomLesson.findByPk(lessonId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!lockedLesson || lockedLesson.archivedAt || !lockedLesson.isPublished || (lockedLesson.publishAt && new Date(lockedLesson.publishAt) > new Date())) {
          throw new customLessonLifecycle.LessonLifecycleError(404, "LESSON_NOT_AVAILABLE", "Lesson not found");
        }
      }
      const [record] = await ClassroomLessonProgress.findOrCreate({
        where: { classroomId: authoritativePlacement.classroomId, lessonId, studentId: req.userId },
        defaults: { classroomId: authoritativePlacement.classroomId, viewedAt: new Date() },
        transaction,
      });
      record.viewedAt ||= new Date();
      record.completedAt = req.body?.completed === false ? null : new Date();
      await record.save({ transaction });
      return record;
    });
    return res.json({ message: progress.completedAt ? "Lesson completed" : "Lesson marked incomplete", progress });
  } catch (error) {
    if (isLessonAccessError(error)) {
      return res.status(error.status).json({ message: error.message, code: error.code, ...error.details });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/classroom-lessons/:lessonId/submission", authMiddleware, uploadLessonFiles, async (req, res) => {
  try {
    if (req.userRole !== "student") { await removeUploadedFiles(req.files); return res.status(403).json({ message: "Student access required" }); }
    const lessonId = Number.parseInt(req.params.lessonId, 10);
    const lesson = await ClassroomLesson.findByPk(lessonId);
    const membership = lesson && await ClassroomMembership.findOne({ where: { classroomId: lesson.classroomId, studentId: req.userId, status: "active" } });
    if (!lesson || lesson.archivedAt || !membership || !isAssignedToStudent(lesson, req.userId) || lesson.contentType !== "assignment" || !lesson.allowSubmissions || !lesson.isPublished || (lesson.publishAt && new Date(lesson.publishAt) > new Date())) { await removeUploadedFiles(req.files); return res.status(404).json({ message: "Submissions are not available" }); }
    const existingSubmission = await ClassroomLessonSubmission.findOne({ where: { lessonId, studentId: req.userId } });
    const policyError = submissionPolicyError(lesson, existingSubmission);
    if (policyError) { await removeUploadedFiles(req.files); return res.status(400).json({ message: policyError }); }
    if ((req.files || []).some((file) => file.size > lesson.maxFileSizeMb * 1024 * 1024)) { await removeUploadedFiles(req.files); return res.status(400).json({ message: `Each file must be ${lesson.maxFileSizeMb} MB or smaller` }); }
    if ((req.files || []).some((file) => !extensionAllowed(file.originalname, lesson.allowedFileTypes))) { await removeUploadedFiles(req.files); return res.status(400).json({ message: `Accepted file types: ${lesson.allowedFileTypes.join(", ")}` }); }
    const comment = String(req.body?.comment || "").trim().slice(0, 4000);
    if (!comment && !req.files?.length) { await removeUploadedFiles(req.files); return res.status(400).json({ message: "Add a response or at least one file" }); }
    const [submission, wasCreated] = await ClassroomLessonSubmission.findOrCreate({
      where: { lessonId, studentId: req.userId },
      defaults: { classroomId: lesson.classroomId, comment: comment || null, submittedAt: new Date(), status: "submitted", attemptCount: 1 },
    });
    if (!wasCreated) {
      submission.comment = comment || null; submission.submittedAt = new Date(); submission.status = "submitted";
      submission.grade = null; submission.feedback = null; submission.gradedAt = null; submission.rubricScores = [];
      submission.attemptCount = (submission.attemptCount || 1) + 1; await submission.save();
    }
    for (const file of req.files || []) {
      const stored = await lessonStorage.uploadFile(file, `classrooms/${lesson.classroomId}/submissions/${submission.id}`);
      await ClassroomLessonSubmissionAttachment.create({
        classroomId: lesson.classroomId, lessonId, submissionId: submission.id, studentId: req.userId,
        originalName: file.originalname.slice(0, 255), mimeType: file.mimetype || "application/octet-stream", sizeBytes: file.size, ...stored,
      });
    }
    await removeUploadedFiles(req.files);
    const saved = await ClassroomLessonSubmission.findByPk(submission.id, { include: [{ model: ClassroomLessonSubmissionAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes"] }] });
    return res.status(201).json({ message: "Work submitted", submission: sanitizeSubmission(saved) });
  } catch (error) { await removeUploadedFiles(req.files); console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.get("/submission-files/:fileId", authMiddleware, async (req, res) => {
  try {
    const file = await ClassroomLessonSubmissionAttachment.findByPk(Number.parseInt(req.params.fileId, 10), { include: [{ model: ClassroomLessonSubmission, as: "submission", required: true }] });
    if (!file) return res.status(404).json({ message: "File not found" });
    let allowed = req.userRole === "admin" || (req.userRole === "student" && file.studentId === req.userId);
    if (req.userRole === "teacher") allowed = Boolean(await Classroom.findOne({ where: { id: file.classroomId, teacherId: req.userId } }));
    if (!allowed) return res.status(403).json({ message: "Access denied" });
    const data = await lessonStorage.readFile(file);
    if (!data) return res.status(404).json({ message: "File not found" });
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    return res.send(data);
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

module.exports = router;
