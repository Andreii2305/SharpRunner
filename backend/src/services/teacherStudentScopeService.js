const { Op } = require("sequelize");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const User = require("../models/User");

const getTeacherStudentScope = async ({
  classroomWhere,
  classroomAttributes,
  classroomOrder = [["createdAt", "DESC"]],
  includeArchivedClassrooms = false,
}) => {
  const classrooms = await Classroom.findAll({
    where: includeArchivedClassrooms
      ? classroomWhere
      : { ...classroomWhere, isActive: true },
    ...(classroomAttributes ? { attributes: classroomAttributes } : {}),
    order: classroomOrder,
  });

  if (classrooms.length === 0) {
    return { classrooms: [], memberships: [], students: [], studentsById: new Map() };
  }

  const classroomIds = classrooms.map((classroom) => classroom.id);
  const memberships = await ClassroomMembership.findAll({
    where: {
      classroomId: { [Op.in]: classroomIds },
      status: "active",
    },
    attributes: ["classroomId", "studentId", "joinedAt", "updatedAt"],
    order: [["updatedAt", "DESC"]],
  });

  const studentIds = [...new Set(memberships.map((membership) => membership.studentId))];
  const students = studentIds.length
    ? await User.findAll({
        where: {
          id: { [Op.in]: studentIds },
          role: "student",
          status: "active",
        },
        attributes: [
          "id",
          "firstName",
          "lastName",
          "username",
          "status",
          "isPlayingGame",
          "lastGameHeartbeatAt",
          "gamificationPreference",
          "createdAt",
          "updatedAt",
        ],
      })
    : [];

  const studentsById = new Map(students.map((student) => [student.id, student]));
  return {
    classrooms,
    students,
    studentsById,
    memberships: memberships.filter((membership) => studentsById.has(membership.studentId)),
  };
};

module.exports = { getTeacherStudentScope };
