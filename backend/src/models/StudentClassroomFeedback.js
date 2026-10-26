const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  STUDENT_CLASSROOM_FEEDBACK_IDEMPOTENCY_KEY_PATTERN,
  STUDENT_CLASSROOM_FEEDBACK_LIMITS,
} = require("../constants/studentClassroomFeedbackConfig");

const StudentClassroomFeedback = sequelize.define("StudentClassroomFeedbacks", {
  classroomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  message: {
    type: DataTypes.STRING(STUDENT_CLASSROOM_FEEDBACK_LIMITS.messageLength),
    allowNull: false,
    set(value) {
      this.setDataValue("message", typeof value === "string" ? value.trim() : value);
    },
    validate: {
      notEmpty: true,
      len: [1, STUDENT_CLASSROOM_FEEDBACK_LIMITS.messageLength],
    },
  },
  idempotencyKey: {
    type: DataTypes.STRING(STUDENT_CLASSROOM_FEEDBACK_LIMITS.idempotencyKeyLength),
    allowNull: false,
    validate: {
      is: STUDENT_CLASSROOM_FEEDBACK_IDEMPOTENCY_KEY_PATTERN,
    },
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["studentId", "idempotencyKey"],
      name: "student_classroom_feedback_student_key",
    },
    {
      fields: ["classroomId", "createdAt", "id"],
      name: "student_classroom_feedback_classroom_created_id",
    },
    {
      fields: ["studentId", "createdAt", "id"],
      name: "student_classroom_feedback_student_created_id",
    },
  ],
});

module.exports = StudentClassroomFeedback;
