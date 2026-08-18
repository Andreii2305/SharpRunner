const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getLessonContentSeed,
  getLessonSeedByKey,
} = require("../services/lessonContentService");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonAttachment = require("../models/ClassroomLessonAttachment");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const path = require("path");
const { uploadDirectory } = require("../middleware/classroomLessonUpload");
const { findPrimaryActiveMembership } = require("../services/studentClassService");

router.get("/", authMiddleware, async (req, res) => {
  try {
    const payload = getLessonContentSeed();
    if (req.userRole !== "student") return res.json({ ...payload, classroomLessons: [] });

    const membership = await findPrimaryActiveMembership(req.userId);
    const classroomLessons = membership
      ? await ClassroomLesson.findAll({
          where: { classroomId: membership.classroomId, isPublished: true },
          attributes: ["id", "title", "description", "dueAt", "createdAt"],
          include: [{
            model: ClassroomLessonAttachment,
            as: "attachments",
            attributes: ["id", "originalName", "mimeType", "sizeBytes"],
          }],
          order: [["createdAt", "DESC"]],
        })
      : [];
    return res.json({ ...payload, classroomLessons });
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
      include: [{ model: ClassroomLesson, as: "lesson", required: true, attributes: ["id", "classroomId", "isPublished"] }],
    });
    if (!attachment || !attachment.lesson?.isPublished) {
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

    const filePath = path.join(uploadDirectory, path.basename(attachment.storedName));
    const inlineType = /^(video\/|audio\/|image\/|application\/pdf$|text\/)/i.test(attachment.mimeType);
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${inlineType ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: "File not found" });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/:lessonKey", authMiddleware, (req, res) => {
  const lesson = getLessonSeedByKey(req.params.lessonKey);
  if (!lesson) {
    return res.status(404).json({ message: "Lesson not found" });
  }

  return res.json(lesson);
});

module.exports = router;
