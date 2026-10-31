const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const XpTransaction = sequelize.define(
  "XpTransactions",
  {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    referenceType: { type: DataTypes.STRING(40), allowNull: false },
    referenceId: { type: DataTypes.STRING(160), allowNull: false },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    completionEvidenceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: { isInt: true, min: 1 },
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["userId", "kind", "referenceType", "referenceId"],
        name: "xp_transactions_reward_once",
      },
      {
        unique: true,
        fields: ["completionEvidenceId"],
        name: "xp_transactions_completion_evidence",
      },
      { fields: ["userId", "createdAt"], name: "xp_transactions_user_history" },
    ],
    validate: {
      completionEvidenceIsLevelReward() {
        if (this.completionEvidenceId == null) return;
        if (this.kind !== "level_completion" || this.referenceType !== "level") {
          throw new Error("Completion evidence is limited to level-completion rewards");
        }
      },
    },
  },
);

module.exports = XpTransaction;
