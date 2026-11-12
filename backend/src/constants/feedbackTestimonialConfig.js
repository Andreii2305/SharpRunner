const FEEDBACK_TESTIMONIAL_LIMITS = Object.freeze({
  messageLength: 1000,
  idempotencyKeyLength: 96,
  moderationExplanationLength: 500,
  consentVersionLength: 64,
  publicNamePreviewVersionLength: 96,
  publicDisplayNameLength: 300,
  suspensionReasonLength: 40,
  consentTextLength: 2000,
});

const FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;
const FEEDBACK_TESTIMONIAL_CONSENT_BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TESTIMONIAL_ATTRIBUTION_MODES = Object.freeze(["named", "anonymous"]);
const TESTIMONIAL_MODERATION_STATUSES = Object.freeze([
  "pending",
  "approved",
  "rejected",
  "revoked",
]);
const TESTIMONIAL_SUSPENSION_REASONS = Object.freeze(["account_deactivated"]);

// This is the ECMAScript String.prototype.trim boundary set. Keep it explicit
// so model normalization and PostgreSQL storage constraints share one contract.
const FEEDBACK_TESTIMONIAL_BOUNDARY_WHITESPACE_PATTERN =
  /^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$/gu;

const normalizeFeedbackTestimonialText = (value) => (
  typeof value === "string"
    ? value.replace(FEEDBACK_TESTIMONIAL_BOUNDARY_WHITESPACE_PATTERN, "")
    : value
);

module.exports = {
  FEEDBACK_TESTIMONIAL_BOUNDARY_WHITESPACE_PATTERN,
  FEEDBACK_TESTIMONIAL_CONSENT_BINDING_PATTERN,
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
  FEEDBACK_TESTIMONIAL_LIMITS,
  normalizeFeedbackTestimonialText,
  TESTIMONIAL_ATTRIBUTION_MODES,
  TESTIMONIAL_MODERATION_STATUSES,
  TESTIMONIAL_SUSPENSION_REASONS,
};
