const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const immutable = () => {
  throw new Error("Classroom lesson reading completions are immutable");
};

const ClassroomLessonReadingCompletion = sequelize.define("ClassroomLessonReadingCompletion", {
  classroomLessonPlacementId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  lessonVersion: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  completedAt: { type: DataTypes.DATE, allowNull: false },
}, {
  timestamps: false,
  indexes: [{
    unique: true,
    fields: ["classroomLessonPlacementId", "studentId", "lessonVersion"],
    name: "classroom_lesson_reading_completion_revision",
  }],
  hooks: {
    beforeUpdate: immutable,
    beforeDestroy: immutable,
    beforeBulkUpdate: immutable,
    beforeBulkDestroy: immutable,
  },
});

module.exports = ClassroomLessonReadingCompletion;
