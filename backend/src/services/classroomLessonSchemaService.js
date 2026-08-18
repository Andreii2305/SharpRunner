const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TABLE = "ClassroomLessons";
const ATTACHMENT_TABLE = "ClassroomLessonAttachments";
const PROGRESS_TABLE = "ClassroomLessonProgresses";
const SUBMISSION_TABLE = "ClassroomLessonSubmissions";
const SUBMISSION_ATTACHMENT_TABLE = "ClassroomLessonSubmissionAttachments";
const VERSION_TABLE = "ClassroomLessonVersions";
const AUDIT_TABLE = "ClassroomLessonAudits";

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
    displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rubric: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, feedbackReleaseAt: { type: DataTypes.DATE, allowNull: true },
    allowLateSubmissions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    allowedFileTypes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, maxFileSizeMb: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    assignedStudentIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
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
    await addMissingColumn(queryInterface, TABLE, lessonTable, "displayOrder", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "rubric", { type: DataTypes.JSONB, allowNull: false, defaultValue: [] });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "feedbackReleaseAt", { type: DataTypes.DATE, allowNull: true });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "allowLateSubmissions", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "maxAttempts", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "allowedFileTypes", { type: DataTypes.JSONB, allowNull: false, defaultValue: [] });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "maxFileSizeMb", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "assignedStudentIds", { type: DataTypes.JSONB, allowNull: false, defaultValue: [] });
    await addMissingColumn(queryInterface, TABLE, lessonTable, "version", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 });
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
    await addMissingColumn(queryInterface, ATTACHMENT_TABLE, attachmentTable, "sha256", { type: DataTypes.STRING(64), allowNull: true });
    await addMissingColumn(queryInterface, ATTACHMENT_TABLE, attachmentTable, "scanStatus", { type: DataTypes.STRING(20), allowNull: false, defaultValue: "not_configured" });
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
      sha256: { type: DataTypes.STRING(64), allowNull: true }, scanStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "not_configured" },
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

  try {
    const submissionTable = await queryInterface.describeTable(SUBMISSION_TABLE);
    await addMissingColumn(queryInterface, SUBMISSION_TABLE, submissionTable, "attemptCount", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 });
    await addMissingColumn(queryInterface, SUBMISSION_TABLE, submissionTable, "rubricScores", { type: DataTypes.JSONB, allowNull: false, defaultValue: [] });
  } catch {
    await queryInterface.createTable(SUBMISSION_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      classroomId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Classrooms", key: "id" }, onDelete: "CASCADE" },
      lessonId: { type: DataTypes.INTEGER, allowNull: false, references: { model: TABLE, key: "id" }, onDelete: "CASCADE" },
      studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" }, onDelete: "CASCADE" },
      comment: { type: DataTypes.TEXT, allowNull: true }, status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "submitted" },
      submittedAt: { type: DataTypes.DATE, allowNull: false }, grade: { type: DataTypes.INTEGER, allowNull: true }, feedback: { type: DataTypes.TEXT, allowNull: true }, gradedAt: { type: DataTypes.DATE, allowNull: true },
      attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }, rubricScores: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(SUBMISSION_TABLE, ["lessonId", "studentId"], { unique: true, name: "classroom_lesson_submission_unique" });
  }

  try {
    const submissionAttachmentTable = await queryInterface.describeTable(SUBMISSION_ATTACHMENT_TABLE);
    await addMissingColumn(queryInterface, SUBMISSION_ATTACHMENT_TABLE, submissionAttachmentTable, "sha256", { type: DataTypes.STRING(64), allowNull: true });
    await addMissingColumn(queryInterface, SUBMISSION_ATTACHMENT_TABLE, submissionAttachmentTable, "scanStatus", { type: DataTypes.STRING(20), allowNull: false, defaultValue: "not_configured" });
  } catch {
    await queryInterface.createTable(SUBMISSION_ATTACHMENT_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      classroomId: { type: DataTypes.INTEGER, allowNull: false }, lessonId: { type: DataTypes.INTEGER, allowNull: false }, studentId: { type: DataTypes.INTEGER, allowNull: false },
      submissionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: SUBMISSION_TABLE, key: "id" }, onDelete: "CASCADE" },
      originalName: { type: DataTypes.STRING(255), allowNull: false }, mimeType: { type: DataTypes.STRING(255), allowNull: false }, sizeBytes: { type: DataTypes.BIGINT, allowNull: false },
      data: { type: DataTypes.BLOB("long"), allowNull: true }, storageProvider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "database" }, storageKey: { type: DataTypes.STRING(500), allowNull: true },
      sha256: { type: DataTypes.STRING(64), allowNull: true }, scanStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "not_configured" },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(SUBMISSION_ATTACHMENT_TABLE, ["submissionId"], { name: "classroom_lesson_submission_files" });
  }

  try { await queryInterface.describeTable(VERSION_TABLE); } catch {
    await queryInterface.createTable(VERSION_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false }, classroomId: { type: DataTypes.INTEGER, allowNull: false },
      lessonId: { type: DataTypes.INTEGER, allowNull: false, references: { model: TABLE, key: "id" }, onDelete: "CASCADE" }, editorId: { type: DataTypes.INTEGER, allowNull: true },
      versionNumber: { type: DataTypes.INTEGER, allowNull: false }, snapshot: { type: DataTypes.JSONB, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(VERSION_TABLE, ["lessonId", "versionNumber"], { name: "classroom_lesson_versions_scope" });
  }
  try { await queryInterface.describeTable(AUDIT_TABLE); } catch {
    await queryInterface.createTable(AUDIT_TABLE, {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false }, classroomId: { type: DataTypes.INTEGER, allowNull: false }, lessonId: { type: DataTypes.INTEGER, allowNull: true }, actorId: { type: DataTypes.INTEGER, allowNull: true },
      action: { type: DataTypes.STRING(50), allowNull: false }, metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(AUDIT_TABLE, ["classroomId", "createdAt"], { name: "classroom_lesson_audit_scope" });
  }
};

module.exports = { ensureClassroomLessonsTable };
