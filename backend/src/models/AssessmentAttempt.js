const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  ASSESSMENT_LIMITS,
  ATTEMPT_STATUSES,
  PRE_BASELINE_STATUSES,
} = require("../constants/assessmentConfig");

const AssessmentAttempt = sequelize.define("AssessmentAttempt", {
  assessmentId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  attemptNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  status: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: ATTEMPT_STATUSES.IN_PROGRESS,
    validate: { isIn: [Object.values(ATTEMPT_STATUSES)] },
  },
  assessmentVersion: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  startedAt: { type: DataTypes.DATE, allowNull: false },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  pointsEarned: { type: DataTypes.DECIMAL(10, 2), allowNull: true, validate: { min: 0 } },
  maxPoints: { type: DataTypes.DECIMAL(10, 2), allowNull: true, validate: { min: 0 } },
  percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true, validate: { min: 0, max: 100 } },
  correctCount: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
  questionCount: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
  passed: { type: DataTypes.BOOLEAN, allowNull: true },
  passingPercentageApplied: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    validate: { min: 0, max: 100 },
  },
  questionOrder: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  choiceOrder: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  submissionKey: { type: DataTypes.STRING(ASSESSMENT_LIMITS.submissionKeyLength), allowNull: true },
  gradingLeaseToken: { type: DataTypes.STRING(96), allowNull: true },
  gradingLeaseExpiresAt: { type: DataTypes.DATE, allowNull: true },
  preBaselineStatus: {
    type: DataTypes.STRING(16),
    allowNull: true,
    validate: { isIn: [Object.values(PRE_BASELINE_STATUSES)] },
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["assessmentId", "studentId", "attemptNumber"],
      name: "assessment_attempts_assessment_student_number",
    },
    {
      unique: true,
      fields: ["assessmentId", "studentId"],
      where: { status: { [require("sequelize").Op.in]: [
        ATTEMPT_STATUSES.IN_PROGRESS,
        ATTEMPT_STATUSES.GRADING,
      ] } },
      name: "assessment_attempts_one_in_progress",
    },
    {
      unique: true,
      fields: ["submissionKey"],
      where: { submissionKey: { [require("sequelize").Op.ne]: null } },
      name: "assessment_attempts_submission_key",
    },
    {
      fields: ["classroomId", "studentId", "submittedAt"],
      name: "assessment_attempts_classroom_student_submitted",
    },
    {
      fields: ["assessmentId", "status", "submittedAt"],
      name: "assessment_attempts_assessment_status_submitted",
    },
  ],
});

module.exports = AssessmentAttempt;
