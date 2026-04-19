const User = require("./User");
const UserProgress = require("./UserProgress");
const AdminActivityLog = require("./AdminActivityLog");
const AdminInvite = require("./AdminInvite");
const Classroom = require("./Classroom");
const ClassroomMembership = require("./ClassroomMembership");
const ClassroomAnnouncement = require("./ClassroomAnnouncement");
const ClassroomAnnouncementView = require("./ClassroomAnnouncementView");
const UserNotificationView = require("./UserNotificationView");
const LevelDeadline = require("./LevelDeadline");

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

Classroom.hasMany(ClassroomAnnouncement, {
  foreignKey: "classroomId",
  as: "announcements",
  onDelete: "CASCADE",
});

ClassroomAnnouncement.belongsTo(Classroom, {
  foreignKey: "classroomId",
  as: "classroom",
});

User.hasMany(ClassroomAnnouncement, {
  foreignKey: "teacherId",
  as: "postedAnnouncements",
  onDelete: "CASCADE",
});

ClassroomAnnouncement.belongsTo(User, {
  foreignKey: "teacherId",
  as: "teacher",
});

ClassroomAnnouncement.hasMany(ClassroomAnnouncementView, {
  foreignKey: "announcementId",
  as: "views",
  onDelete: "CASCADE",
});

ClassroomAnnouncementView.belongsTo(ClassroomAnnouncement, {
  foreignKey: "announcementId",
  as: "announcement",
});

User.hasMany(ClassroomAnnouncementView, {
  foreignKey: "studentId",
  as: "announcementViews",
  onDelete: "CASCADE",
});

ClassroomAnnouncementView.belongsTo(User, {
  foreignKey: "studentId",
  as: "student",
});

User.hasMany(UserNotificationView, {
  foreignKey: "userId",
  as: "notificationViews",
  onDelete: "CASCADE",
});

UserNotificationView.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

Classroom.hasMany(LevelDeadline, {
  foreignKey: "classroomId",
  as: "levelDeadlines",
  onDelete: "CASCADE",
});

LevelDeadline.belongsTo(Classroom, {
  foreignKey: "classroomId",
  as: "classroom",
});

module.exports = {
  User,
  UserProgress,
  AdminActivityLog,
  AdminInvite,
  Classroom,
  ClassroomMembership,
  ClassroomAnnouncement,
  ClassroomAnnouncementView,
  UserNotificationView,
  LevelDeadline,
};
