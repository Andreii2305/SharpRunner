const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const {
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
  FEEDBACK_TESTIMONIAL_LIMITS,
  normalizeFeedbackTestimonialText,
  TESTIMONIAL_ATTRIBUTION_MODES,
  TESTIMONIAL_MODERATION_STATUSES,
} = require("../constants/feedbackTestimonialConfig");

const hasValue = (value) => value !== null && value !== undefined;
const hasNonBlankText = (value) => (
  typeof value === "string" && normalizeFeedbackTestimonialText(value).length > 0
);

const PublicTestimonialRevision = sequelize.define("PublicTestimonialRevision", {
  submissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { isInt: true, min: 1 },
  },
  authorUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { isInt: true, min: 1 },
  },
  revisionNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { isInt: true, min: 1 },
  },
  isCurrent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
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
  attributionMode: {
    type: DataTypes.STRING(16),
    allowNull: false,
    validate: { isIn: [TESTIMONIAL_ATTRIBUTION_MODES] },
  },
  publicDisplayNameSnapshot: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.publicDisplayNameLength),
    allowNull: true,
    validate: { len: [1, FEEDBACK_TESTIMONIAL_LIMITS.publicDisplayNameLength] },
  },
  publicNamePreviewVersion: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.publicNamePreviewVersionLength),
    allowNull: true,
    validate: { len: [1, FEEDBACK_TESTIMONIAL_LIMITS.publicNamePreviewVersionLength] },
  },
  consentVersion: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.consentVersionLength),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, FEEDBACK_TESTIMONIAL_LIMITS.consentVersionLength],
    },
  },
  consentedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  idempotencyKey: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.idempotencyKeyLength),
    allowNull: false,
    validate: { is: FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN },
  },
  moderationStatus: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: "pending",
    validate: { isIn: [TESTIMONIAL_MODERATION_STATUSES] },
  },
  moderationExplanation: {
    type: DataTypes.STRING(FEEDBACK_TESTIMONIAL_LIMITS.moderationExplanationLength),
    allowNull: true,
    set(value) {
      this.setDataValue(
        "moderationExplanation",
        normalizeFeedbackTestimonialText(value),
      );
    },
    validate: { len: [1, FEEDBACK_TESTIMONIAL_LIMITS.moderationExplanationLength] },
  },
  approvedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { isInt: true, min: 1 },
  },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  rejectedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { isInt: true, min: 1 },
  },
  rejectedAt: { type: DataTypes.DATE, allowNull: true },
  revokedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { isInt: true, min: 1 },
  },
  revokedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "PublicTestimonialRevisions",
  indexes: [
    {
      unique: true,
      fields: ["submissionId", "revisionNumber"],
      name: "public_testimonial_revisions_submission_revision",
    },
    {
      unique: true,
      fields: ["authorUserId", "idempotencyKey"],
      name: "public_testimonial_revisions_author_key",
    },
    {
      unique: true,
      fields: ["submissionId"],
      where: { isCurrent: true },
      name: "public_testimonial_revisions_one_current",
    },
    {
      fields: ["submissionId", "revisionNumber", "id"],
      name: "public_testimonial_revisions_submission_history",
    },
    {
      fields: ["moderationStatus", "createdAt", "id"],
      name: "public_testimonial_revisions_moderation_queue",
    },
    {
      fields: ["approvedAt", "id"],
      where: { isCurrent: true, moderationStatus: "approved" },
      name: "public_testimonial_revisions_public_order",
    },
  ],
  validate: {
    attributionEvidenceIsConsistent() {
      const hasName = hasNonBlankText(this.publicDisplayNameSnapshot);
      const hasPreview = hasNonBlankText(this.publicNamePreviewVersion);
      if (this.attributionMode === "named" && (!hasName || !hasPreview)) {
        throw new Error("named attribution requires a display snapshot and preview version");
      }
      if (this.attributionMode === "anonymous" && (hasValue(this.publicDisplayNameSnapshot)
        || hasValue(this.publicNamePreviewVersion))) {
        throw new Error("anonymous attribution cannot retain named evidence");
      }
    },
    moderationMetadataIsConsistent() {
      const approval = hasValue(this.approvedByUserId) && hasValue(this.approvedAt);
      const rejection = hasValue(this.rejectedByUserId) && hasValue(this.rejectedAt);
      const revocation = hasValue(this.revokedByUserId) && hasValue(this.revokedAt);
      const explanation = hasNonBlankText(this.moderationExplanation);
      const incompletePair = (hasValue(this.approvedByUserId) !== hasValue(this.approvedAt))
        || (hasValue(this.rejectedByUserId) !== hasValue(this.rejectedAt))
        || (hasValue(this.revokedByUserId) !== hasValue(this.revokedAt));
      if (incompletePair) throw new Error("moderation actor and timestamp must be paired");

      if (this.moderationStatus === "pending"
        && (approval || rejection || revocation || hasValue(this.moderationExplanation))) {
        throw new Error("pending moderation cannot contain decision metadata");
      }
      if (this.moderationStatus === "approved"
        && (!approval || rejection || revocation || hasValue(this.moderationExplanation))) {
        throw new Error("approved moderation metadata is inconsistent");
      }
      if (this.moderationStatus === "rejected"
        && (!rejection || approval || revocation || !explanation)) {
        throw new Error("rejected moderation requires rejection metadata and explanation");
      }
      if (this.moderationStatus === "revoked") {
        if (!approval || rejection || !revocation || !explanation) {
          throw new Error("revoked moderation requires approval and revocation metadata");
        }
        if (new Date(this.revokedAt).getTime() < new Date(this.approvedAt).getTime()) {
          throw new Error("revocation cannot precede approval");
        }
      }
    },
  },
});

module.exports = PublicTestimonialRevision;
