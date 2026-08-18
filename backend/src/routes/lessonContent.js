const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getLessonContentSeed,
  getLessonSeedByKey,
} = require("../services/lessonContentService");
const ClassroomLesson = require("../models/ClassroomLesson");
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
          order: [["createdAt", "DESC"]],
        })
      : [];
    return res.json({ ...payload, classroomLessons });
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
