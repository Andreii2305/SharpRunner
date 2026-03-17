const User = require("./User");
const UserProgress = require("./UserProgress");
const AdminActivityLog = require("./AdminActivityLog");

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

module.exports = {
  User,
  UserProgress,
  AdminActivityLog,
};
