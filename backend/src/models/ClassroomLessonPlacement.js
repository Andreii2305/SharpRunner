const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonPlacement = sequelize.define("ClassroomLessonPlacements", {
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  moduleId: { type: DataTypes.INTEGER, allowNull: true },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  archivedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  indexes: [
    { unique: true, fields: ["lessonId", "classroomId"] },
    {
      unique: true,
      fields: ["id", "classroomId"],
      name: "classroom_lesson_placements_id_classroom_unique",
    },
    {
      unique: true,
      fields: ["id", "classroomId", "lessonId"],
      name: "classroom_lesson_placements_id_classroom_lesson_unique",
    },
    { fields: ["classroomId", "moduleId", "displayOrder"] },
  ],
});

module.exports = ClassroomLessonPlacement;
