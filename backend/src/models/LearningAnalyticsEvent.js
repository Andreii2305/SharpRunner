const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EVENT_TYPE_VALUES = [
  "level_started",
  "solution_attempt_failed",
  "level_completed",
  "active_time_recorded",
  "hint_used",
];

const LearningAnalyticsEvent = sequelize.define("LearningAnalyticsEvent", {
  id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: true },
  levelKey: { type: DataTypes.STRING(255), allowNull: false },
  lessonKey: { type: DataTypes.STRING(120), allowNull: false },
  eventType: {
    type: DataTypes.STRING(40),
    allowNull: false,
    validate: { isIn: [EVENT_TYPE_VALUES] },
  },
  occurredAt: { type: DataTypes.DATE, allowNull: false },
  attemptNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1 },
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: true,
    validate: { min: 0, max: 100 },
  },
  failureCategory: { type: DataTypes.STRING(40), allowNull: true },
  failureCode: { type: DataTypes.STRING(64), allowNull: true },
  activeSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1 },
  },
  hintType: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: { isIn: [["basic", "detailed"]] },
  },
  hintPurchased: { type: DataTypes.BOOLEAN, allowNull: true },
  hintXpCost: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1 },
  },
  dedupeKey: { type: DataTypes.STRING(96), allowNull: false },
}, {
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ["dedupeKey"],
      name: "learning_analytics_events_dedupe",
    },
    {
      fields: ["classroomId", "studentId", "occurredAt"],
      name: "learning_analytics_events_classroom_student_time",
    },
    {
      fields: ["studentId", "occurredAt"],
      name: "learning_analytics_events_student_time",
    },
    {
      fields: ["eventType", "occurredAt"],
      name: "learning_analytics_events_type_time",
    },
    {
      fields: ["lessonKey", "levelKey", "occurredAt"],
      name: "learning_analytics_events_lesson_level_time",
    },
  ],
});

module.exports = LearningAnalyticsEvent;
