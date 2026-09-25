const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AssessmentResponse = sequelize.define("AssessmentResponse", {
  attemptId: { type: DataTypes.INTEGER, allowNull: false },
  questionId: { type: DataTypes.INTEGER, allowNull: false },
  selectedChoiceId: { type: DataTypes.INTEGER, allowNull: true },
  isCorrect: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  pointsAwarded: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
}, {
  indexes: [{
    unique: true,
    fields: ["attemptId", "questionId"],
    name: "assessment_responses_attempt_question",
  }],
});

module.exports = AssessmentResponse;
