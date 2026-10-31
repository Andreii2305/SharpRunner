const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  GAME_INTERRUPTION_EVENT_TYPE,
  GAME_INTERRUPTION_HISTORY_LIMITS,
  GAME_INTERRUPTION_KEY_PATTERN,
  isBoundedTwoDecimalDeduction,
} = require("../constants/gameInterruptionHistoryConfig");

const GameInterruptionEvent = sequelize.define("GameInterruptionEvents", {
  sessionId: { type: DataTypes.INTEGER, allowNull: false },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  completionEvidenceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    validate: { isInt: true, min: 1 },
  },
  eventKey: {
    type: DataTypes.STRING(GAME_INTERRUPTION_HISTORY_LIMITS.keyLength),
    allowNull: false,
    validate: { is: GAME_INTERRUPTION_KEY_PATTERN },
  },
  eventType: {
    type: DataTypes.STRING(24),
    allowNull: false,
    validate: { isIn: [Object.values(GAME_INTERRUPTION_EVENT_TYPE)] },
  },
  receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  appliedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  appliedScoreDeduction: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      isBoundedTwoDecimal(value) {
        if (value !== null && value !== undefined && !isBoundedTwoDecimalDeduction(value)) {
          throw new Error("appliedScoreDeduction must be between 0 and 100 with at most two decimals");
        }
      },
    },
  },
  appliedXpDeduction: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    validate: {
      isInt: true,
      min: 0,
      max: GAME_INTERRUPTION_HISTORY_LIMITS.maximumDeduction,
    },
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["studentId", "eventKey"],
      name: "game_interruption_events_student_key",
    },
    {
      fields: ["sessionId", "receivedAt", "id"],
      where: { appliedAt: null },
      name: "game_interruption_events_unapplied",
    },
    {
      fields: [
        "sessionId",
        { name: "receivedAt", order: "DESC" },
        { name: "id", order: "DESC" },
      ],
      name: "game_interruption_events_session_history",
    },
  ],
  validate: {
    applicationFieldsAreConsistent() {
      const hasAppliedAt = this.appliedAt !== null && this.appliedAt !== undefined;
      const hasScore = this.appliedScoreDeduction !== null
        && this.appliedScoreDeduction !== undefined;
      const hasXp = this.appliedXpDeduction !== null && this.appliedXpDeduction !== undefined;
      const hasEvidence = this.completionEvidenceId !== null
        && this.completionEvidenceId !== undefined;
      if (!(hasAppliedAt === hasScore && hasScore === hasXp && hasXp === hasEvidence)) {
        throw new Error("Applied deduction fields must be all null or all present");
      }
      if (hasAppliedAt
        && new Date(this.appliedAt).getTime() < new Date(this.receivedAt).getTime()) {
        throw new Error("appliedAt cannot precede receivedAt");
      }
    },
  },
});

module.exports = GameInterruptionEvent;
