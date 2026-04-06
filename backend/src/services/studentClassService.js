const { Op } = require("sequelize");
const ClassroomMembership = require("../models/ClassroomMembership");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const { computeXpFromTotalPercent } = require("./progressService");

const formatDisplayName = (user) => {
  if (!user) {
    return "Student";
  }

  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName || user.username || "Student";
};

const toTimestamp = (value) => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const findPrimaryActiveMembership = async (studentId, { includeTeacher = false } = {}) =>
  ClassroomMembership.findOne({
    where: {
      studentId,
      status: "active",
    },
    attributes: ["id", "classroomId", "studentId", "status", "joinedAt", "updatedAt"],
    include: [
      {
        model: Classroom,
        as: "classroom",
        required: true,
        where: { isActive: true },
        attributes: [
          "id",
          "teacherId",
          "className",
          "section",
          "schoolYear",
          "maxStudents",
          "description",
          "classCode",
          "isActive",
          "createdAt",
          "updatedAt",
        ],
        include: includeTeacher
          ? [
              {
                model: User,
                as: "teacher",
                required: false,
                attributes: ["id", "firstName", "lastName", "username"],
              },
            ]
          : [],
      },
    ],
    order: [
      ["joinedAt", "DESC"],
      ["updatedAt", "DESC"],
    ],
  });

const buildClassroomLeaderboard = async ({
  classroomId,
  currentUserId = null,
  limit = null,
}) => {
  const memberships = await ClassroomMembership.findAll({
    where: {
      classroomId,
      status: "active",
    },
    attributes: ["studentId", "joinedAt", "updatedAt"],
  });

  if (memberships.length === 0) {
    return {
      classSize: 0,
      currentUserRank: null,
      leaderboard: [],
    };
  }

  const membershipByStudentId = new Map(
    memberships.map((membership) => [membership.studentId, membership])
  );
  const studentIds = Array.from(membershipByStudentId.keys());

  const students = await User.findAll({
    where: {
      id: { [Op.in]: studentIds },
      role: "student",
    },
    attributes: ["id", "firstName", "lastName", "username", "updatedAt"],
  });

  const validStudentIds = students.map((student) => student.id);
  const progressRows = validStudentIds.length
    ? await UserProgress.findAll({
        where: {
          userId: { [Op.in]: validStudentIds },
        },
        attributes: ["userId", "progressPercent", "isCompleted", "updatedAt"],
      })
    : [];

  const statsByStudentId = new Map(
    validStudentIds.map((studentId) => [
      studentId,
      {
        totalPercent: 0,
        levelsCleared: 0,
        lastProgressAt: null,
      },
    ])
  );

  for (const row of progressRows) {
    if (!statsByStudentId.has(row.userId)) {
      continue;
    }

    const stats = statsByStudentId.get(row.userId);
    stats.totalPercent += row.progressPercent ?? 0;
    if (row.isCompleted) {
      stats.levelsCleared += 1;
    }

    const updatedAt = toTimestamp(row.updatedAt);
    if (updatedAt && (!stats.lastProgressAt || updatedAt > stats.lastProgressAt)) {
      stats.lastProgressAt = updatedAt;
    }
  }

  const rankedEntries = students
    .map((student) => {
      const membership = membershipByStudentId.get(student.id);
      const stats = statsByStudentId.get(student.id) ?? {
        totalPercent: 0,
        levelsCleared: 0,
        lastProgressAt: null,
      };
      const membershipUpdatedAt = toTimestamp(membership?.updatedAt);
      const userUpdatedAt = toTimestamp(student.updatedAt);
      const lastActivityAt = Math.max(
        stats.lastProgressAt ?? 0,
        membershipUpdatedAt ?? 0,
        userUpdatedAt ?? 0
      );

      return {
        userId: student.id,
        name: formatDisplayName(student),
        username: student.username,
        xp: computeXpFromTotalPercent(stats.totalPercent),
        levelsCleared: stats.levelsCleared,
        lastActivityAt: lastActivityAt > 0 ? new Date(lastActivityAt).toISOString() : null,
      };
    })
    .sort((a, b) => {
      if (b.xp !== a.xp) {
        return b.xp - a.xp;
      }

      if (b.levelsCleared !== a.levelsCleared) {
        return b.levelsCleared - a.levelsCleared;
      }

      const aTime = toTimestamp(a.lastActivityAt) ?? 0;
      const bTime = toTimestamp(b.lastActivityAt) ?? 0;
      if (bTime !== aTime) {
        return bTime - aTime;
      }

      return a.name.localeCompare(b.name);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

  const currentUserRank =
    currentUserId != null
      ? rankedEntries.find((entry) => entry.userId === currentUserId)?.rank ?? null
      : null;

  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : null;
  const leaderboard = normalizedLimit
    ? rankedEntries.slice(0, normalizedLimit)
    : rankedEntries;

  return {
    classSize: rankedEntries.length,
    currentUserRank,
    leaderboard,
  };
};

module.exports = {
  formatDisplayName,
  findPrimaryActiveMembership,
  buildClassroomLeaderboard,
};

