const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const HintFeedback = sequelize.define("HintFeedback", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  levelKey: { type: DataTypes.STRING(255), allowNull: false },
  failureCode: { type: DataTypes.STRING(64), allowNull: false },
  hintStage: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: { isIn: [["personalized", "stronger"]] },
  },
  helpful: { type: DataTypes.BOOLEAN, allowNull: false },
  fallbackUsed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  indexes: [
    {
      unique: true,
      fields: ["userId", "levelKey", "failureCode", "hintStage"],
      name: "hint_feedback_one_response_per_stage",
    },
    { fields: ["levelKey", "failureCode", "hintStage"] },
  ],
});

module.exports = HintFeedback;
