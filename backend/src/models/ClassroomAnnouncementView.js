const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ClassroomAnnouncementView = sequelize.define(
  "ClassroomAnnouncementViews",
  {
    announcementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    studentId: {
      type: DataTypes.INTEGER,
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
        fields: ["announcementId", "studentId"],
      },
    ],
  }
);

module.exports = ClassroomAnnouncementView;
