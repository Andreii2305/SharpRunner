const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TABLE = "ClassroomLessons";
const ATTACHMENT_TABLE = "ClassroomLessonAttachments";

const ensureClassroomLessonsTable = async () => {
  const queryInterface = sequelize.getQueryInterface();
  let lessonTableExists = true;
  try { await queryInterface.describeTable(TABLE); } catch { lessonTableExists = false; }
  if (!lessonTableExists) await queryInterface.createTable(TABLE, {
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
  if (!lessonTableExists) await queryInterface.addIndex(TABLE, ["classroomId"], {
    name: "classroom_lessons_classroom_id",
  });

  try {
    const attachmentTable = await queryInterface.describeTable(ATTACHMENT_TABLE);
    if (!attachmentTable.data) {
      await queryInterface.addColumn(ATTACHMENT_TABLE, "data", {
        type: DataTypes.BLOB("long"),
        allowNull: true,
      });
    }
  } catch {
    await queryInterface.createTable(ATTACHMENT_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      classroomId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Classrooms", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
      lessonId: { type: DataTypes.INTEGER, allowNull: false, references: { model: TABLE, key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
      originalName: { type: DataTypes.STRING(255), allowNull: false },
      storedName: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      mimeType: { type: DataTypes.STRING(255), allowNull: false },
      sizeBytes: { type: DataTypes.BIGINT, allowNull: false },
      data: { type: DataTypes.BLOB("long"), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(ATTACHMENT_TABLE, ["classroomId", "lessonId"], { name: "classroom_lesson_attachments_scope" });
  }
};

module.exports = { ensureClassroomLessonsTable };
