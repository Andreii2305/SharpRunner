const { DataTypes, Op } = require("sequelize");
const sequelize = require("../config/database");
const { ASSESSMENT_LIMITS } = require("../constants/assessmentConfig");

const AssessmentAttemptGrant = sequelize.define("AssessmentAttemptGrant", {
  assessmentId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  grantedByUserId: { type: DataTypes.INTEGER, allowNull: false },
  reason: { type: DataTypes.STRING(500), allowNull: true },
  idempotencyKey: {
    type: DataTypes.STRING(ASSESSMENT_LIMITS.submissionKeyLength),
    allowNull: false,
  },
  consumedByAttemptId: { type: DataTypes.INTEGER, allowNull: true },
  consumedAt: { type: DataTypes.DATE, allowNull: true },
  answerReviewWasEligibleAtGrant: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  indexes: [
    {
      unique: true,
      fields: ["idempotencyKey"],
      name: "assessment_attempt_grants_idempotency_key",
    },
    {
      unique: true,
      fields: ["assessmentId", "studentId"],
      where: { consumedByAttemptId: { [Op.is]: null } },
      name: "assessment_attempt_grants_one_unused",
    },
    {
      unique: true,
      fields: ["consumedByAttemptId"],
      where: { consumedByAttemptId: { [Op.ne]: null } },
      name: "assessment_attempt_grants_consumed_attempt",
    },
    {
      fields: ["classroomId", "studentId", "createdAt"],
      name: "assessment_attempt_grants_classroom_student_created",
    },
  ],
});

module.exports = AssessmentAttemptGrant;
