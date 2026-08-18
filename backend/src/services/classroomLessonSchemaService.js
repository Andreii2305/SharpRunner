const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TABLE = "ClassroomLessons";

const ensureClassroomLessonsTable = async () => {
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.describeTable(TABLE);
    return;
  } catch {
    // Create the table for deployments that do not run separate migrations.
  }

  await queryInterface.createTable(TABLE, {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    classroomId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Classrooms", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    title: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    dueAt: { type: DataTypes.DATE, allowNull: true },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex(TABLE, ["classroomId"], {
    name: "classroom_lessons_classroom_id",
  });
};

module.exports = { ensureClassroomLessonsTable };
