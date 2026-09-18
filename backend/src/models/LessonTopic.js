const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const LessonTopic = sequelize.define("LessonTopics", {
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(180), allowNull: false },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  content: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: { format: "markdown", body: "", codeBlocks: [], practiceBlocks: [] },
  },
});

module.exports = LessonTopic;
