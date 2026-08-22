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
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["userId", "kind", "referenceType", "referenceId"],
        name: "xp_transactions_reward_once",
      },
      { fields: ["userId", "createdAt"], name: "xp_transactions_user_history" },
    ],
  },
);

module.exports = XpTransaction;
