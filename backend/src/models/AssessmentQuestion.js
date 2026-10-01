const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { ASSESSMENT_LIMITS, QUESTION_TYPES } = require("../constants/assessmentConfig");

const AssessmentQuestion = sequelize.define("AssessmentQuestion", {
  assessmentId: { type: DataTypes.INTEGER, allowNull: false },
  questionText: { type: DataTypes.TEXT, allowNull: false },
  questionType: {
    type: DataTypes.STRING(24),
    allowNull: false,
    validate: { isIn: [Object.values(QUESTION_TYPES)] },
  },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  points: {
    type: DataTypes.DECIMAL(10, ASSESSMENT_LIMITS.pointPrecision),
    allowNull: false,
    defaultValue: 1,
    validate: { min: 0.01, max: ASSESSMENT_LIMITS.maxPoints },
  },
  explanation: { type: DataTypes.TEXT, allowNull: true },
  objectiveKey: { type: DataTypes.STRING(ASSESSMENT_LIMITS.objectiveKeyLength), allowNull: true },
  starterCode: { type: DataTypes.TEXT, allowNull: true },
  codingTypeName: { type: DataTypes.STRING(128), allowNull: true },
  codingMethodName: { type: DataTypes.STRING(64), allowNull: true },
  codingParameterTypes: { type: DataTypes.JSONB, allowNull: true },
  codingReturnType: { type: DataTypes.STRING(16), allowNull: true },
}, {
  indexes: [
    {
      unique: true,
      fields: ["assessmentId", "displayOrder"],
      name: "assessment_questions_assessment_order",
    },
    {
      fields: ["assessmentId", "objectiveKey"],
      name: "assessment_questions_assessment_objective",
    },
  ],
});

module.exports = AssessmentQuestion;
