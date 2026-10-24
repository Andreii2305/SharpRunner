const isAttachmentDeliverable = (scanStatus) =>
  scanStatus === "clean"
  || (scanStatus === "signature_checked" && process.env.REQUIRE_FILE_SCANNING !== "true");

module.exports = { isAttachmentDeliverable };
