const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN,
  PRIVATE_CHECK_IN_LIMITS,
} = require("../constants/privateCheckInConfig");

const TeacherStudentCheckIn = sequelize.define("TeacherStudentCheckIns", {
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  senderRole: {
    type: DataTypes.STRING(16),
    allowNull: false,
    validate: {
      isIn: [["teacher", "admin"]],
    },
  },
  recipientStudentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  classroomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  message: {
    type: DataTypes.STRING(PRIVATE_CHECK_IN_LIMITS.messageLength),
    allowNull: false,
    set(value) {
      this.setDataValue("message", typeof value === "string" ? value.trim() : value);
    },
    validate: {
      notEmpty: true,
      len: [1, PRIVATE_CHECK_IN_LIMITS.messageLength],
    },
  },
  idempotencyKey: {
    type: DataTypes.STRING(PRIVATE_CHECK_IN_LIMITS.idempotencyKeyLength),
    allowNull: false,
    validate: {
      is: PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN,
    },
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["senderId", "idempotencyKey"],
      name: "teacher_student_check_ins_sender_key",
    },
    {
      fields: ["recipientStudentId", "createdAt"],
      name: "teacher_student_check_ins_recipient_created",
    },
  ],
});

module.exports = TeacherStudentCheckIn;
