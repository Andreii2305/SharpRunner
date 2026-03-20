const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Classroom = sequelize.define("Classrooms", {
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  className: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  section: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "General Section",
  },
  classCode: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
});

module.exports = Classroom;
