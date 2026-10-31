const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const {
  GAME_INTERRUPTION_HISTORY_LIMITS,
  GAME_INTERRUPTION_KEY_PATTERN,
  GAME_INTERRUPTION_SESSION_STATUS,
  isBoundedTwoDecimalDeduction,
} = require("../constants/gameInterruptionHistoryConfig");

const statusValues = Object.values(GAME_INTERRUPTION_SESSION_STATUS);

const GameInterruptionSession = sequelize.define("GameInterruptionSessions", {
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  classroomId: { type: DataTypes.INTEGER, allowNull: false },
  levelKey: {
    type: DataTypes.STRING(GAME_INTERRUPTION_HISTORY_LIMITS.levelKeyLength),
    allowNull: false,
    validate: { isIn: [PLAYABLE_LEVEL_KEYS] },
  },
  sessionKey: {
    type: DataTypes.STRING(GAME_INTERRUPTION_HISTORY_LIMITS.keyLength),
    allowNull: false,
    validate: { is: GAME_INTERRUPTION_KEY_PATTERN },
  },
  scoreDeductionSnapshot: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      isBoundedTwoDecimal(value) {
        if (!isBoundedTwoDecimalDeduction(value)) {
          throw new Error("scoreDeductionSnapshot must be between 0 and 100 with at most two decimals");
        }
      },
    },
  },
  xpDeductionSnapshot: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isInt: true,
      min: 0,
      max: GAME_INTERRUPTION_HISTORY_LIMITS.maximumDeduction,
    },
  },
  lifecycleStatus: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: GAME_INTERRUPTION_SESSION_STATUS.CURRENT,
    validate: { isIn: [statusValues] },
  },
  startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  supersededAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
}, {
  indexes: [
    {
      unique: true,
      fields: ["studentId", "sessionKey"],
      name: "game_interruption_sessions_student_key",
    },
    {
      unique: true,
      fields: ["id", "studentId"],
      name: "game_interruption_sessions_id_student",
    },
    {
      unique: true,
      fields: ["studentId", "classroomId", "levelKey"],
      where: { lifecycleStatus: GAME_INTERRUPTION_SESSION_STATUS.CURRENT },
      name: "game_interruption_sessions_one_current",
    },
    {
      fields: ["classroomId", "studentId", "levelKey", "createdAt", "id"],
      name: "game_interruption_sessions_scope_history",
    },
  ],
  validate: {
    lifecycleFieldsMatchStatus() {
      const status = this.lifecycleStatus;
      const started = this.startedAt && new Date(this.startedAt).getTime();
      const superseded = this.supersededAt && new Date(this.supersededAt).getTime();
      const completed = this.completedAt && new Date(this.completedAt).getTime();
      if (status === GAME_INTERRUPTION_SESSION_STATUS.CURRENT
        && (this.supersededAt || this.completedAt)) {
        throw new Error("Current sessions cannot have terminal timestamps");
      }
      if (status === GAME_INTERRUPTION_SESSION_STATUS.SUPERSEDED
        && (!this.supersededAt || this.completedAt)) {
        throw new Error("Superseded sessions require only supersededAt");
      }
      if (status === GAME_INTERRUPTION_SESSION_STATUS.COMPLETED
        && (!this.completedAt || this.supersededAt)) {
        throw new Error("Completed sessions require only completedAt");
      }
      if ((superseded && superseded < started) || (completed && completed < started)) {
        throw new Error("Terminal timestamps cannot precede startedAt");
      }
    },
  },
});

module.exports = GameInterruptionSession;
