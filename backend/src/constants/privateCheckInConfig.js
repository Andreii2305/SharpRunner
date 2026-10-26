const PRIVATE_CHECK_IN_LIMITS = Object.freeze({
  messageLength: 1000,
  idempotencyKeyLength: 96,
});

const PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;

module.exports = {
  PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN,
  PRIVATE_CHECK_IN_LIMITS,
};
