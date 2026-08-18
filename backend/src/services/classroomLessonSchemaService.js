const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TABLE = "ClassroomLessons";
const ATTACHMENT_TABLE = "ClassroomLessonAttachments";
const PROGRESS_TABLE = "ClassroomLessonProgresses";
const SUBMISSION_TABLE = "ClassroomLessonSubmissions";
const SUBMISSION_ATTACHMENT_TABLE = "ClassroomLessonSubmissionAttachments";

const addMissingColumn = async (queryInterface, table, description, name, definition) => {
  if (!description[name]) await queryInterface.addColumn(table, name, definition);
};

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
    contentType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "lesson" },
    description: { type: DataTypes.TEXT, allowNull: true },
    dueAt: { type: DataTypes.DATE, allowNull: true },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    publishAt: { type: DataTypes.DATE, allowNull: true },
    allowSubmissions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    maxScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });
  if (!lessonTableExists) await queryInterface.addIndex(TABLE, ["classroomId"], {
    name: "classroom_lessons_classroom_id",
  });
  if (lessonTableExists) {
    const lessonTable = await queryInterface.describeTable(TABLE);
    await addMissingColumn(queryInterface, TABLE, lessonTable, "contentType", { type: DataTypes.STRING(20), allowNull: false, defaultValue: "lesson" });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "publishAt", { type: DataTypes.DATE, allowNull: true });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "allowSubmissions", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "maxScore", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 });
  }
  await queryInterface.bulkUpdate(TABLE, { contentType: "assignment" }, { allowSubmissions: true, contentType: "lesson" });

  try {
    const attachmentTable = await queryInterface.describeTable(ATTACHMENT_TABLE);
    if (!attachmentTable.data) {
      await queryInterface.addColumn(ATTACHMENT_TABLE, "data", {
        type: DataTypes.BLOB("long"),
        allowNull: true,
      });
    }
    await addMissingColumn(queryInterface, ATTACHMENT_TABLE, attachmentTable, "displayOrder", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await addMissingColumn(queryInterface, ATTACHMENT_TABLE, attachmentTable, "storageProvider", { type: DataTypes.STRING(30), allowNull: false, defaultValue: "database" });
    await addMissingColumn(queryInterface, ATTACHMENT_TABLE, attachmentTable, "storageKey", { type: DataTypes.STRING(500), allowNull: true });
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
      displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      storageProvider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "database" },
      storageKey: { type: DataTypes.STRING(500), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(ATTACHMENT_TABLE, ["classroomId", "lessonId"], { name: "classroom_lesson_attachments_scope" });
  }

  try { await queryInterface.describeTable(PROGRESS_TABLE); } catch {
    await queryInterface.createTable(PROGRESS_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      classroomId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Classrooms", key: "id" }, onDelete: "CASCADE" },
      lessonId: { type: DataTypes.INTEGER, allowNull: false, references: { model: TABLE, key: "id" }, onDelete: "CASCADE" },
      studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" }, onDelete: "CASCADE" },
      viewedAt: { type: DataTypes.DATE, allowNull: true }, completedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(PROGRESS_TABLE, ["lessonId", "studentId"], { unique: true, name: "classroom_lesson_progress_unique" });
  }

  try { await queryInterface.describeTable(SUBMISSION_TABLE); } catch {
    await queryInterface.createTable(SUBMISSION_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      classroomId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Classrooms", key: "id" }, onDelete: "CASCADE" },
      lessonId: { type: DataTypes.INTEGER, allowNull: false, references: { model: TABLE, key: "id" }, onDelete: "CASCADE" },
      studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" }, onDelete: "CASCADE" },
      comment: { type: DataTypes.TEXT, allowNull: true }, status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "submitted" },
      submittedAt: { type: DataTypes.DATE, allowNull: false }, grade: { type: DataTypes.INTEGER, allowNull: true }, feedback: { type: DataTypes.TEXT, allowNull: true }, gradedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(SUBMISSION_TABLE, ["lessonId", "studentId"], { unique: true, name: "classroom_lesson_submission_unique" });
  }

  try { await queryInterface.describeTable(SUBMISSION_ATTACHMENT_TABLE); } catch {
    await queryInterface.createTable(SUBMISSION_ATTACHMENT_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      classroomId: { type: DataTypes.INTEGER, allowNull: false }, lessonId: { type: DataTypes.INTEGER, allowNull: false }, studentId: { type: DataTypes.INTEGER, allowNull: false },
      submissionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: SUBMISSION_TABLE, key: "id" }, onDelete: "CASCADE" },
      originalName: { type: DataTypes.STRING(255), allowNull: false }, mimeType: { type: DataTypes.STRING(255), allowNull: false }, sizeBytes: { type: DataTypes.BIGINT, allowNull: false },
      data: { type: DataTypes.BLOB("long"), allowNull: true }, storageProvider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "database" }, storageKey: { type: DataTypes.STRING(500), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(SUBMISSION_ATTACHMENT_TABLE, ["submissionId"], { name: "classroom_lesson_submission_files" });
  }
};

module.exports = { ensureClassroomLessonsTable };
