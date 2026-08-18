const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonVersion = sequelize.define("ClassroomLessonVersions", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false },
  editorId: { type: DataTypes.INTEGER, allowNull: true },
  versionNumber: { type: DataTypes.INTEGER, allowNull: false },
  snapshot: { type: DataTypes.JSONB, allowNull: false },
});

module.exports = ClassroomLessonVersion;
