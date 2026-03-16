const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getLessonContentSeed,
  getLessonSeedByKey,
} = require("../services/lessonContentService");

router.get("/", authMiddleware, (req, res) => {
  return res.json(getLessonContentSeed());
});

router.get("/:lessonKey", authMiddleware, (req, res) => {
  const lesson = getLessonSeedByKey(req.params.lessonKey);
  if (!lesson) {
    return res.status(404).json({ message: "Lesson not found" });
  }

  return res.json(lesson);
});

module.exports = router;
