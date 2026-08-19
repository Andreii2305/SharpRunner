const router = require("express").Router();
const { Op } = require("sequelize");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getLessonContentSeed,
  getLessonSeedByKey,
} = require("../services/lessonContentService");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonAttachment = require("../models/ClassroomLessonAttachment");
const ClassroomLessonProgress = require("../models/ClassroomLessonProgress");
const ClassroomLessonSubmission = require("../models/ClassroomLessonSubmission");
const ClassroomLessonSubmissionAttachment = require("../models/ClassroomLessonSubmissionAttachment");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const path = require("path");
const { uploadDirectory, uploadLessonFiles, removeUploadedFiles, lessonUploadPolicy } = require("../middleware/classroomLessonUpload");
const lessonStorage = require("../services/lessonFileStorageService");
const { isOfficeDocument, convertOfficeToPdf } = require("../services/officePreviewService");
const { extensionAllowed } = require("../services/fileSecurityService");
const { isStudentAssigned, submissionPolicyError } = require("../services/classroomLessonPolicyService");
const { findPrimaryActiveMembership } = require("../services/studentClassService");

const visibleLessonWhere = (classroomId) => ({
  classroomId,
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

router.get("/", authMiddleware, async (req, res) => {
  try {
    const payload = getLessonContentSeed();
    if (req.userRole !== "student") return res.json({ ...payload, classroomLessons: [] });

    const membership = await findPrimaryActiveMembership(req.userId);
    const classroomLessons = membership
      ? await ClassroomLesson.findAll({
          where: visibleLessonWhere(membership.classroomId),
          attributes: ["id", "title", "description", "contentType", "dueAt", "allowSubmissions", "assignedStudentIds", "createdAt"],
          include: [{
            model: ClassroomLessonAttachment,
            as: "attachments",
            attributes: ["id", "originalName", "mimeType", "sizeBytes"],
          }],
          order: [["createdAt", "DESC"]],
        })
      : [];
    return res.json({ ...payload, classroomLessons: classroomLessons.filter((lesson) => isAssignedToStudent(lesson, req.userId)) });
  } catch (error) {
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
      attributes: ["id", "classroomId", "title", "description", "contentType", "dueAt", "isPublished", "publishAt", "allowSubmissions", "maxScore", "rubric", "feedbackReleaseAt", "allowLateSubmissions", "maxAttempts", "allowedFileTypes", "maxFileSizeMb", "assignedStudentIds", "createdAt", "updatedAt"],
      include: [{
        model: ClassroomLessonAttachment,
        as: "attachments",
        attributes: ["id", "originalName", "mimeType", "sizeBytes", "displayOrder"],
      }],
    });
    const currentlyVisible = lesson?.isPublished && (!lesson.publishAt || new Date(lesson.publishAt) <= new Date());
    if (!lesson || (req.userRole === "student" && (!currentlyVisible || !isAssignedToStudent(lesson, req.userId)))) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    let allowed = req.userRole === "admin";
    if (req.userRole === "teacher") {
      allowed = Boolean(await Classroom.findOne({
        where: { id: lesson.classroomId, teacherId: req.userId },
        attributes: ["id"],
      }));
    } else if (req.userRole === "student") {
      allowed = Boolean(await ClassroomMembership.findOne({
        where: { classroomId: lesson.classroomId, studentId: req.userId, status: "active" },
        attributes: ["id"],
      }));
    }
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    let progress = null;
    let submission = null;
    if (req.userRole === "student") {
      [progress] = await ClassroomLessonProgress.findOrCreate({
        where: { lessonId, studentId: req.userId },
        defaults: { classroomId: lesson.classroomId, viewedAt: new Date(), completedAt: null },
      });
      if (!progress.viewedAt) { progress.viewedAt = new Date(); await progress.save(); }
      submission = await ClassroomLessonSubmission.findOne({
        where: { lessonId, studentId: req.userId },
        include: [{ model: ClassroomLessonSubmissionAttachment, as: "attachments", attributes: ["id", "originalName", "mimeType", "sizeBytes"] }],
      });
    }
    lesson.attachments?.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id);
    const releaseFeedback = !lesson.feedbackReleaseAt || new Date(lesson.feedbackReleaseAt) <= new Date();
    const lessonPayload = lesson.toJSON ? lesson.toJSON() : lesson;
    lessonPayload.maxFileSizeMb = Math.min(lessonPayload.maxFileSizeMb || lessonUploadPolicy.maxFileSizeMb, lessonUploadPolicy.maxFileSizeMb);
    return res.json({ lesson: lessonPayload, progress, submission: sanitizeSubmission(submission, { releaseFeedback }), uploadPolicy: lessonUploadPolicy });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
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
      include: [{ model: ClassroomLesson, as: "lesson", required: true, attributes: ["id", "classroomId", "isPublished", "publishAt", "assignedStudentIds"] }],
    });
    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    let allowed = req.userRole === "admin";
    if (req.userRole === "teacher") {
      allowed = Boolean(await Classroom.findOne({ where: { id: attachment.classroomId, teacherId: req.userId }, attributes: ["id"] }));
    } else if (req.userRole === "student") {
      allowed = Boolean(await ClassroomMembership.findOne({
        where: { classroomId: attachment.classroomId, studentId: req.userId, status: "active" },
        attributes: ["id"],
      }));
    }
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    if (req.userRole === "student" && (!attachment.lesson?.isPublished || !isAssignedToStudent(attachment.lesson, req.userId) || (attachment.lesson.publishAt && new Date(attachment.lesson.publishAt) > new Date()))) {
      return res.status(404).json({ message: "Attachment not found" });
    }
    const filePath = path.join(uploadDirectory, path.basename(attachment.storedName));
    const inlineType = /^(video\/|audio\/|image\/|application\/pdf$|text\/)/i.test(attachment.mimeType);
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${inlineType ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
    const storedData = await lessonStorage.readFile(attachment);
    if (storedData) {
      res.setHeader("Content-Length", String(storedData.length));
      return res.send(storedData);
    }
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: "File not found" });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/classroom-files/:fileId/preview", authMiddleware, async (req, res) => {
  try {
    const attachment = await ClassroomLessonAttachment.findByPk(Number.parseInt(req.params.fileId, 10), {
      include: [{ model: ClassroomLesson, as: "lesson", required: true, attributes: ["id", "classroomId", "isPublished", "publishAt", "assignedStudentIds"] }],
    });
    if (!attachment || !isOfficeDocument(attachment.originalName)) return res.status(404).json({ message: "Preview not found" });
    let allowed = req.userRole === "admin";
    if (req.userRole === "teacher") allowed = Boolean(await Classroom.findOne({ where: { id: attachment.classroomId, teacherId: req.userId } }));
    if (req.userRole === "student") allowed = attachment.lesson.isPublished && isAssignedToStudent(attachment.lesson, req.userId) && (!attachment.lesson.publishAt || new Date(attachment.lesson.publishAt) <= new Date()) && Boolean(await ClassroomMembership.findOne({ where: { classroomId: attachment.classroomId, studentId: req.userId, status: "active" } }));
    if (!allowed) return res.status(403).json({ message: "Access denied" });
    const data = await lessonStorage.readFile(attachment);
    const pdf = data && await convertOfficeToPdf(data, attachment.originalName);
    if (!pdf) return res.status(415).json({ message: "Office preview requires LibreOffice on the server" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(`${attachment.originalName}.pdf`)}`);
    return res.send(pdf);
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.put("/classroom-lessons/:lessonId/completion", authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== "student") return res.status(403).json({ message: "Student access required" });
    const lessonId = Number.parseInt(req.params.lessonId, 10);
    const lesson = await ClassroomLesson.findByPk(lessonId);
    const membership = lesson && await ClassroomMembership.findOne({ where: { classroomId: lesson.classroomId, studentId: req.userId, status: "active" } });
    if (!lesson || !membership || !isAssignedToStudent(lesson, req.userId) || lesson.contentType !== "lesson" || !lesson.isPublished || (lesson.publishAt && new Date(lesson.publishAt) > new Date())) return res.status(404).json({ message: "Lesson not found" });
    const [progress] = await ClassroomLessonProgress.findOrCreate({ where: { lessonId, studentId: req.userId }, defaults: { classroomId: lesson.classroomId, viewedAt: new Date() } });
    progress.viewedAt ||= new Date();
    progress.completedAt = req.body?.completed === false ? null : new Date();
    await progress.save();
    return res.json({ message: progress.completedAt ? "Lesson completed" : "Lesson marked incomplete", progress });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Server error" }); }
});

router.post("/classroom-lessons/:lessonId/submission", authMiddleware, uploadLessonFiles, async (req, res) => {
  try {
    if (req.userRole !== "student") { await removeUploadedFiles(req.files); return res.status(403).json({ message: "Student access required" }); }
    const lessonId = Number.parseInt(req.params.lessonId, 10);
    const lesson = await ClassroomLesson.findByPk(lessonId);
    const membership = lesson && await ClassroomMembership.findOne({ where: { classroomId: lesson.classroomId, studentId: req.userId, status: "active" } });
    if (!lesson || !membership || !isAssignedToStudent(lesson, req.userId) || lesson.contentType !== "assignment" || !lesson.allowSubmissions || !lesson.isPublished || (lesson.publishAt && new Date(lesson.publishAt) > new Date())) { await removeUploadedFiles(req.files); return res.status(404).json({ message: "Submissions are not available" }); }
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

router.get("/:lessonKey", authMiddleware, (req, res) => {
  const lesson = getLessonSeedByKey(req.params.lessonKey);
  if (!lesson) {
    return res.status(404).json({ message: "Lesson not found" });
  }

  return res.json(lesson);
});

module.exports = router;
