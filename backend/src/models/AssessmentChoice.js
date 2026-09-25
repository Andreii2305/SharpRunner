const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { ASSESSMENT_LIMITS } = require("../constants/assessmentConfig");

const AssessmentChoice = sequelize.define("AssessmentChoice", {
  questionId: { type: DataTypes.INTEGER, allowNull: false },
  choiceText: { type: DataTypes.STRING(ASSESSMENT_LIMITS.choiceTextLength), allowNull: false },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  isCorrect: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  indexes: [{
    unique: true,
    fields: ["questionId", "displayOrder"],
    name: "assessment_choices_question_order",
  }],
});

module.exports = AssessmentChoice;
