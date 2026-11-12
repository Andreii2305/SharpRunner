const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
  FEEDBACK_TESTIMONIAL_LIMITS,
  normalizeFeedbackTestimonialText,
} = require("../constants/feedbackTestimonialConfig");

const PlatformFeedbackSubmission = sequelize.define("PlatformFeedbackSubmission", {
  authorUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { isInt: true, min: 1 },
  },
  message: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.messageLength),
    allowNull: false,
    set(value) {
      this.setDataValue("message", normalizeFeedbackTestimonialText(value));
    },
    validate: {
      notEmpty: true,
      len: [1, FEEDBACK_TESTIMONIAL_LIMITS.messageLength],
    },
  },
  idempotencyKey: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.idempotencyKeyLength),
    allowNull: false,
    validate: { is: FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN },
  },
}, {
  tableName: "PlatformFeedbackSubmissions",
  indexes: [
    {
      unique: true,
      fields: ["authorUserId", "idempotencyKey"],
      name: "platform_feedback_submissions_author_key",
    },
    {
      fields: ["authorUserId", "createdAt", "id"],
      name: "platform_feedback_submissions_author_created_id",
    },
    {
      fields: ["createdAt", "id"],
      name: "platform_feedback_submissions_admin_created_id",
    },
  ],
});

module.exports = PlatformFeedbackSubmission;
