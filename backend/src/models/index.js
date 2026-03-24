const User = require("./User");
const UserProgress = require("./UserProgress");
const AdminActivityLog = require("./AdminActivityLog");
const AdminInvite = require("./AdminInvite");
const Classroom = require("./Classroom");
const ClassroomMembership = require("./ClassroomMembership");

User.hasMany(UserProgress, {
  foreignKey: "userId",
  as: "progressEntries",
  onDelete: "CASCADE",
});

UserProgress.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(AdminActivityLog, {
  foreignKey: "actorUserId",
  as: "adminActions",
  onDelete: "SET NULL",
});

User.hasMany(AdminActivityLog, {
  foreignKey: "targetUserId",
  as: "activityTargets",
  onDelete: "SET NULL",
});

AdminActivityLog.belongsTo(User, {
  foreignKey: "actorUserId",
  as: "actor",
});

AdminActivityLog.belongsTo(User, {
  foreignKey: "targetUserId",
  as: "target",
});

User.hasMany(AdminInvite, {
  foreignKey: "usedByUserId",
  as: "usedAdminInvites",
  onDelete: "SET NULL",
});

AdminInvite.belongsTo(User, {
  foreignKey: "usedByUserId",
  as: "usedBy",
});

User.hasMany(Classroom, {
  foreignKey: "teacherId",
  as: "teacherClassrooms",
  onDelete: "CASCADE",
});

Classroom.belongsTo(User, {
  foreignKey: "teacherId",
  as: "teacher",
});

Classroom.hasMany(ClassroomMembership, {
  foreignKey: "classroomId",
  as: "memberships",
  onDelete: "CASCADE",
});

ClassroomMembership.belongsTo(Classroom, {
  foreignKey: "classroomId",
  as: "classroom",
});

User.hasMany(ClassroomMembership, {
  foreignKey: "studentId",
  as: "classroomMemberships",
  onDelete: "CASCADE",
});

ClassroomMembership.belongsTo(User, {
  foreignKey: "studentId",
  as: "student",
});

module.exports = {
  User,
  UserProgress,
  AdminActivityLog,
  AdminInvite,
  Classroom,
  ClassroomMembership,
};
