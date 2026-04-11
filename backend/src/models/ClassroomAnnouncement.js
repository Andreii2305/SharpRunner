const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomAnnouncement = sequelize.define("ClassroomAnnouncements", {
  classroomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
});

module.exports = ClassroomAnnouncement;
