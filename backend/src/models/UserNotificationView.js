const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const UserNotificationView = sequelize.define(
  "UserNotificationViews",
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    notificationKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    viewedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["userId", "notificationKey"],
      },
    ],
  }
);

module.exports = UserNotificationView;
