const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
  FEEDBACK_TESTIMONIAL_LIMITS,
  TESTIMONIAL_SUSPENSION_REASONS,
} = require("../constants/feedbackTestimonialConfig");

const PublicTestimonialSubmission = sequelize.define("PublicTestimonialSubmission", {
  authorUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { isInt: true, min: 1 },
  },
  idempotencyKey: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.idempotencyKeyLength),
    allowNull: false,
    validate: { is: FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN },
  },
  withdrawnAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  publicationSuspendedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  publicationSuspensionReason: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.suspensionReasonLength),
    allowNull: true,
    validate: { isIn: [TESTIMONIAL_SUSPENSION_REASONS] },
  },
}, {
  tableName: "PublicTestimonialSubmissions",
  indexes: [
    {
      unique: true,
      fields: ["authorUserId", "idempotencyKey"],
      name: "public_testimonial_submissions_author_key",
    },
    {
      unique: true,
      fields: ["id", "authorUserId"],
      name: "public_testimonial_submissions_id_author",
    },
    {
      fields: ["authorUserId", "createdAt", "id"],
      name: "public_testimonial_submissions_author_created_id",
    },
  ],
  validate: {
    suspensionFieldsArePaired() {
      const hasTimestamp = this.publicationSuspendedAt !== null
        && this.publicationSuspendedAt !== undefined;
      const hasReason = this.publicationSuspensionReason !== null
        && this.publicationSuspensionReason !== undefined;
      if (hasTimestamp !== hasReason) {
        throw new Error("publication suspension timestamp and reason must be paired");
      }
    },
  },
});

module.exports = PublicTestimonialSubmission;
