const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const {
  ensureProgressRowsForUser,
  buildProgressSummary,
} = require("../services/progressService");
const {
  formatDisplayName,
  findPrimaryActiveMembership,
  buildClassroomLeaderboard,
} = require("../services/studentClassService");

router.use(authMiddleware, requireRole("student"));

router.get("/me", async (req, res) => {
  try {
    const primaryMembership = await findPrimaryActiveMembership(req.userId, {
      includeTeacher: true,
    });

    const rows = await ensureProgressRowsForUser(req.userId);

    let classRank = null;
    let classSize = null;
    if (primaryMembership) {
      const leaderboardData = await buildClassroomLeaderboard({
        classroomId: primaryMembership.classroomId,
        currentUserId: req.userId,
        limit: null,
      });
      classRank = leaderboardData.currentUserRank;
      classSize = leaderboardData.classSize;
    }

    const summary = buildProgressSummary(rows, { classRank, classSize }).summary;
    const notifications = [];

    if (primaryMembership?.classroom) {
      const classroom = primaryMembership.classroom;
      const teacher = classroom.teacher ?? null;
      const teacherName = teacher ? formatDisplayName(teacher) : "Teacher";
      notifications.push({
        id: `classroom-${classroom.id}-${req.userId}`,
        message: `You are enrolled in ${classroom.className} (${classroom.section}).`,
        teacherName,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    if (summary.currentLevelName) {
      notifications.push({
        id: `current-level-${req.userId}`,
        message: `Continue ${summary.currentLevelName} to keep progressing.`,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    if (Number.isInteger(classRank) && Number.isInteger(classSize)) {
      notifications.push({
        id: `class-rank-${req.userId}`,
        message: `You are currently rank #${classRank} out of ${classSize} students.`,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    if ((summary.totalLevelsCleared ?? 0) > 0) {
      notifications.push({
        id: `levels-cleared-${req.userId}`,
        message: `Great work. You have cleared ${summary.totalLevelsCleared} level${
          summary.totalLevelsCleared === 1 ? "" : "s"
        } so far.`,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    return res.json({ notifications });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

