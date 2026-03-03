const User = require("./User");
const UserProgress = require("./UserProgress");

User.hasMany(UserProgress, {
  foreignKey: "userId",
  as: "progressEntries",
  onDelete: "CASCADE",
});

UserProgress.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

module.exports = {
  User,
  UserProgress,
};
