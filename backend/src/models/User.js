const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define("Users", {
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  emailVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  authProvider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "password",
    validate: {
      isIn: [["password", "google"]],
    },
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "student",
    validate: {
      isIn: [["student", "teacher", "admin"]],
    },
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "active",
    validate: {
      isIn: [["active", "inactive", "pending", "archived"]],
    },
  },
  tokenVersion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 },
  },
  isPlayingGame: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  lastGameHeartbeatAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  xpTotal: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 },
  },
  gamificationPreference: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: { isIn: [["progress", "competition", "rewards", "story"]] },
  },
  learningGameInterest: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: { isIn: [["challenges", "exploration", "competition", "rewards"]] },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
});

module.exports = User;
