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
  },
  schoolYear: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  maxStudents: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
    },
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
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
