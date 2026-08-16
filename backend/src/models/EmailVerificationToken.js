const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EmailVerificationToken = sequelize.define("EmailVerificationTokens", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tokenHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  codeHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

module.exports = EmailVerificationToken;
