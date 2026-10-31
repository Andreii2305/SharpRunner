const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");

const MAX_INTEGER = 2147483647;

const parseHundredths = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const amount = (Number(match[1]) * 100) + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
};

const exactScore = (minimum, maximum) => (value) => {
  const hundredths = parseHundredths(value);
  if (hundredths === null || hundredths < minimum || hundredths > maximum) {
    throw new Error("score must be an exact two-decimal value within bounds");
  }
};

const GameInterruptionCompletionEvidence = sequelize.define(
  "GameInterruptionCompletionEvidence",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    levelKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: { isIn: [PLAYABLE_LEVEL_KEYS] },
    },
    policyVersion: {
      type: DataTypes.STRING(40),
      allowNull: false,
      validate: { notEmpty: true, len: [1, 40] },
    },
    appliedEventCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 0, max: MAX_INTEGER },
    },
    baseScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: { exactScore: exactScore(7500, 10000) },
    },
    scoreDeduction: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: { exactScore: exactScore(0, 10000) },
    },
    finalScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: { exactScore: exactScore(7500, 10000) },
    },
    grossCompletionXp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 0, max: MAX_INTEGER },
    },
    xpDeduction: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 0, max: MAX_INTEGER },
    },
    netCompletionXp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: 0, max: MAX_INTEGER },
    },
    completedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "GameInterruptionCompletionEvidence",
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["studentId", "levelKey"],
        name: "game_interruption_completion_evidence_student_level",
      },
      {
        unique: true,
        fields: ["id", "studentId"],
        name: "game_interruption_completion_evidence_id_student",
      },
    ],
    validate: {
      calculationIsConsistent() {
        const base = parseHundredths(this.baseScore);
        const deducted = parseHundredths(this.scoreDeduction);
        const final = parseHundredths(this.finalScore);
        if (base === null || deducted === null || final === null || base - deducted !== final) {
          throw new Error("score calculation is inconsistent");
        }
        if (!Number.isSafeInteger(this.grossCompletionXp)
          || !Number.isSafeInteger(this.xpDeduction)
          || !Number.isSafeInteger(this.netCompletionXp)
          || this.grossCompletionXp - this.xpDeduction !== this.netCompletionXp) {
          throw new Error("XP calculation is inconsistent");
        }
      },
    },
  },
);

module.exports = GameInterruptionCompletionEvidence;
