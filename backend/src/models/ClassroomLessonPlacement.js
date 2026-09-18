const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonPlacement = sequelize.define("ClassroomLessonPlacements", {
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  moduleId: { type: DataTypes.INTEGER, allowNull: true },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  indexes: [
    { unique: true, fields: ["lessonId", "classroomId"] },
    { fields: ["classroomId", "moduleId", "displayOrder"] },
  ],
});

module.exports = ClassroomLessonPlacement;
