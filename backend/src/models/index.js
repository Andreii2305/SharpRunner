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
const LevelContentOverride = require("./LevelContentOverride");
const EmailVerificationToken = require("./EmailVerificationToken");
const ClassroomLesson = require("./ClassroomLesson");
const ClassroomLessonAttachment = require("./ClassroomLessonAttachment");
const ClassroomLessonProgress = require("./ClassroomLessonProgress");
const ClassroomLessonSubmission = require("./ClassroomLessonSubmission");
const ClassroomLessonSubmissionAttachment = require("./ClassroomLessonSubmissionAttachment");
const ClassroomLessonVersion = require("./ClassroomLessonVersion");
const ClassroomLessonAudit = require("./ClassroomLessonAudit");
const XpTransaction = require("./XpTransaction");

User.hasMany(EmailVerificationToken, {
  foreignKey: "userId",
  as: "emailVerificationTokens",
  onDelete: "CASCADE",
});

EmailVerificationToken.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(UserProgress, {
  foreignKey: "userId",
  as: "progressEntries",
  onDelete: "CASCADE",
});

UserProgress.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(XpTransaction, {
  foreignKey: "userId",
  as: "xpTransactions",
  onDelete: "CASCADE",
});

XpTransaction.belongsTo(User, { foreignKey: "userId", as: "user" });

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

Classroom.hasMany(ClassroomLesson, {
  foreignKey: "classroomId",
  as: "lessons",
  onDelete: "CASCADE",
});

ClassroomLesson.belongsTo(Classroom, {
  foreignKey: "classroomId",
  as: "classroom",
});

ClassroomLesson.hasMany(ClassroomLesson, {
  foreignKey: "moduleId",
  as: "moduleLessons",
  onDelete: "SET NULL",
});

ClassroomLesson.belongsTo(ClassroomLesson, {
  foreignKey: "moduleId",
  as: "module",
});

ClassroomLesson.hasMany(ClassroomLessonAttachment, {
  foreignKey: "lessonId",
  as: "attachments",
  onDelete: "CASCADE",
});

ClassroomLessonAttachment.belongsTo(ClassroomLesson, {
  foreignKey: "lessonId",
  as: "lesson",
});

ClassroomLesson.hasMany(ClassroomLessonProgress, { foreignKey: "lessonId", as: "progress", onDelete: "CASCADE" });
ClassroomLessonProgress.belongsTo(ClassroomLesson, { foreignKey: "lessonId", as: "lesson" });
User.hasMany(ClassroomLessonProgress, { foreignKey: "studentId", as: "classroomLessonProgress", onDelete: "CASCADE" });
ClassroomLessonProgress.belongsTo(User, { foreignKey: "studentId", as: "student" });

ClassroomLesson.hasMany(ClassroomLessonSubmission, { foreignKey: "lessonId", as: "submissions", onDelete: "CASCADE" });
ClassroomLessonSubmission.belongsTo(ClassroomLesson, { foreignKey: "lessonId", as: "lesson" });
User.hasMany(ClassroomLessonSubmission, { foreignKey: "studentId", as: "classroomLessonSubmissions", onDelete: "CASCADE" });
ClassroomLessonSubmission.belongsTo(User, { foreignKey: "studentId", as: "student" });
ClassroomLessonSubmission.hasMany(ClassroomLessonSubmissionAttachment, { foreignKey: "submissionId", as: "attachments", onDelete: "CASCADE" });
ClassroomLessonSubmissionAttachment.belongsTo(ClassroomLessonSubmission, { foreignKey: "submissionId", as: "submission" });
ClassroomLesson.hasMany(ClassroomLessonVersion, { foreignKey: "lessonId", as: "versions", onDelete: "CASCADE" });
ClassroomLessonVersion.belongsTo(ClassroomLesson, { foreignKey: "lessonId", as: "lesson" });
User.hasMany(ClassroomLessonVersion, { foreignKey: "editorId", as: "lessonVersions" });
ClassroomLessonVersion.belongsTo(User, { foreignKey: "editorId", as: "editor" });
ClassroomLesson.hasMany(ClassroomLessonAudit, { foreignKey: "lessonId", as: "auditEntries", onDelete: "SET NULL" });
ClassroomLessonAudit.belongsTo(ClassroomLesson, { foreignKey: "lessonId", as: "lesson" });
ClassroomLessonAudit.belongsTo(User, { foreignKey: "actorId", as: "actor" });

Classroom.hasMany(ClassroomLessonAttachment, {
  foreignKey: "classroomId",
  as: "lessonAttachments",
  onDelete: "CASCADE",
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

Classroom.hasMany(LevelContentOverride, {
  foreignKey: "classroomId",
  as: "levelContentOverrides",
  onDelete: "CASCADE",
});

LevelContentOverride.belongsTo(Classroom, {
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
  LevelContentOverride,
  EmailVerificationToken,
  ClassroomLesson,
  ClassroomLessonAttachment,
  ClassroomLessonProgress,
  ClassroomLessonSubmission,
  ClassroomLessonSubmissionAttachment,
  ClassroomLessonVersion,
  ClassroomLessonAudit,
  XpTransaction,
};
