const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  ACADEMIC_LESSON_KEYS,
  ANSWER_REVIEW_POLICIES,
  ASSESSMENT_LIMITS,
  ASSESSMENT_TYPES,
  GRADE_CALCULATIONS,
} = require("../constants/assessmentConfig");

const LessonAssessment = sequelize.define("LessonAssessment", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonKey: {
    type: DataTypes.STRING(120),
    allowNull: false,
    validate: { isIn: [ACADEMIC_LESSON_KEYS] },
  },
  type: {
    type: DataTypes.STRING(8),
    allowNull: false,
    validate: { isIn: [Object.values(ASSESSMENT_TYPES)] },
  },
  title: { type: DataTypes.STRING(ASSESSMENT_LIMITS.titleLength), allowNull: false },
  instructions: { type: DataTypes.TEXT, allowNull: true },
  isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  passingPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    validate: { min: 0, max: 100 },
  },
  maxAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: ASSESSMENT_LIMITS.maxAttempts },
  },
  gradeCalculation: {
    type: DataTypes.STRING(16),
    allowNull: false,
    validate: { isIn: [Object.values(GRADE_CALCULATIONS)] },
  },
  requirePassingForCompletion: { type: DataTypes.BOOLEAN, allowNull: false },
  showScoreAfterSubmission: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  answerReviewPolicy: {
    type: DataTypes.STRING(32),
    allowNull: false,
    validate: { isIn: [Object.values(ANSWER_REVIEW_POLICIES)] },
  },
  shuffleQuestions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  shuffleChoices: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
}, {
  indexes: [{
    unique: true,
    fields: ["classroomId", "lessonKey", "type"],
    name: "lesson_assessments_classroom_lesson_type",
  }],
});

module.exports = LessonAssessment;
