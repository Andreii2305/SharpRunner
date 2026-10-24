const assert = require("node:assert/strict");
const { test } = require("node:test");

test("attachment delivery policy permits only statuses allowed by the configured scanning requirement", () => {
  const { isAttachmentDeliverable } = require("../src/services/attachmentDeliveryPolicyService");
  const previousRequirement = process.env.REQUIRE_FILE_SCANNING;

  try {
    const statuses = [
      { status: "clean", optional: true, required: true },
      { status: "signature_checked", optional: true, required: false },
      { status: "not_configured", optional: false, required: false },
      { status: null, optional: false, required: false },
      { status: undefined, optional: false, required: false },
      { status: "infected", optional: false, required: false },
      { status: "dangerous_signature", optional: false, required: false },
      { status: "future_status", optional: false, required: false },
    ];

    for (const requirement of [undefined, "false", "true"]) {
      for (const { status, optional, required } of statuses) {
        if (requirement === undefined) delete process.env.REQUIRE_FILE_SCANNING;
        else process.env.REQUIRE_FILE_SCANNING = requirement;
        assert.equal(
          isAttachmentDeliverable(status),
          requirement === "true" ? required : optional,
          `requirement=${requirement ?? "unset"}, status=${String(status)}`,
        );
      }
    }
  } finally {
    if (previousRequirement === undefined) delete process.env.REQUIRE_FILE_SCANNING;
    else process.env.REQUIRE_FILE_SCANNING = previousRequirement;
  }
});
