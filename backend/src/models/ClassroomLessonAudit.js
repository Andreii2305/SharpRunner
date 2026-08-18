const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomLessonAudit = sequelize.define("ClassroomLessonAudits", {
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: true },
  actorId: { type: DataTypes.INTEGER, allowNull: true },
  action: { type: DataTypes.STRING(50), allowNull: false },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
});

module.exports = ClassroomLessonAudit;
