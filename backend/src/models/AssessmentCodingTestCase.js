const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { CODING_TEST_VISIBILITIES } = require("../constants/assessmentConfig");

const AssessmentCodingTestCase = sequelize.define("AssessmentCodingTestCase", {
  questionId: { type: DataTypes.INTEGER, allowNull: false },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  visibility: {
    type: DataTypes.STRING(8),
    allowNull: false,
    validate: { isIn: [Object.values(CODING_TEST_VISIBILITIES)] },
  },
  input: { type: DataTypes.JSONB, allowNull: false },
  expectedOutput: { type: DataTypes.JSONB, allowNull: false },
  weight: { type: DataTypes.DECIMAL(10, 2), allowNull: false, validate: { min: 0.01 } },
}, {
  indexes: [{
    unique: true,
    fields: ["questionId", "displayOrder"],
    name: "assessment_coding_tests_question_order",
  }],
});

module.exports = AssessmentCodingTestCase;
