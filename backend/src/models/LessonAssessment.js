const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  ACADEMIC_LESSON_KEYS,
  ANSWER_REVIEW_POLICIES,
  ASSESSMENT_LIMITS,
  ASSESSMENT_TARGET_KINDS,
  ASSESSMENT_TYPES,
  GRADE_CALCULATIONS,
} = require("../constants/assessmentConfig");

const LessonAssessment = sequelize.define("LessonAssessment", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  targetKind: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: ASSESSMENT_TARGET_KINDS.BUILT_IN,
    validate: { isIn: [Object.values(ASSESSMENT_TARGET_KINDS)] },
  },
  lessonKey: {
    type: DataTypes.STRING(120),
    allowNull: true,
    validate: { isIn: [ACADEMIC_LESSON_KEYS] },
  },
  classroomLessonPlacementId: { type: DataTypes.INTEGER, allowNull: true },
  targetLessonVersion: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1 } },
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
  accessGateEstablishedAt: { type: DataTypes.DATE, allowNull: true },
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
  indexes: [
    {
      unique: true,
      fields: ["classroomId", "lessonKey", "type"],
      name: "lesson_assessments_classroom_lesson_type",
    },
    {
      unique: true,
      fields: ["classroomLessonPlacementId", "type"],
      where: { targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT },
      name: "lesson_assessments_custom_placement_type",
    },
  ],
  validate: {
    assessmentTargetShape() {
      const isBuiltIn = this.targetKind === ASSESSMENT_TARGET_KINDS.BUILT_IN;
      const isPlacement = this.targetKind === ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT;
      const positivePlacementId = Number.isInteger(this.classroomLessonPlacementId)
        && this.classroomLessonPlacementId > 0;
      const positiveLessonVersion = Number.isInteger(this.targetLessonVersion)
        && this.targetLessonVersion > 0;
      if (isBuiltIn) {
        if (!this.lessonKey || this.classroomLessonPlacementId != null || this.targetLessonVersion != null) {
          throw new Error("Invalid assessment target");
        }
        return;
      }
      if (!isPlacement || this.lessonKey != null || !positivePlacementId || !positiveLessonVersion) {
        throw new Error("Invalid assessment target");
      }
      if (this.isPublished || this.publishedAt != null) {
        throw new Error("Custom assessment target publication is not enabled");
      }
    },
  },
  hooks: {
    beforeUpdate(assessment) {
      if (assessment.previous("accessGateEstablishedAt") != null
        && assessment.changed("accessGateEstablishedAt")) {
        throw new Error("Custom PRE access gate establishment is immutable");
      }
    },
  },
});

module.exports = LessonAssessment;
