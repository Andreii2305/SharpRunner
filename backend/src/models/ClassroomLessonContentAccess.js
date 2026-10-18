const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const immutable = () => {
  throw new Error("Classroom lesson content access records are immutable");
};

const ClassroomLessonContentAccess = sequelize.define("ClassroomLessonContentAccess", {
  classroomLessonPlacementId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  lessonVersion: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  accessedAt: { type: DataTypes.DATE, allowNull: false },
}, {
  timestamps: false,
  indexes: [{
    unique: true,
    fields: ["classroomLessonPlacementId", "studentId", "lessonVersion"],
    name: "classroom_lesson_content_access_revision",
  }],
  hooks: {
    beforeUpdate: immutable,
    beforeDestroy: immutable,
    beforeBulkUpdate: immutable,
    beforeBulkDestroy: immutable,
  },
});

module.exports = ClassroomLessonContentAccess;
