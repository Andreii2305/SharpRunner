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
      isIn: [["active", "inactive"]],
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = User;
