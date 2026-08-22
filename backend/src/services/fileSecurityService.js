const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const BLOCKED_EXTENSIONS = new Set([".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".scr", ".vbs", ".js", ".jar", ".apk"]);
const LEARNING_RESOURCE_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".ppt", ".pptx", ".doc", ".docx", ".odt", ".odp",
  ".txt", ".rtf", ".csv", ".xls", ".xlsx", ".ods",
  ".mp4", ".webm", ".mp3", ".wav", ".ogg",
]);
const LEARNING_RESOURCE_MIME_TYPES = new Set([
  "application/pdf", "application/msword", "application/rtf",
  "application/vnd.ms-powerpoint", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/plain", "text/csv",
]);
const isDangerousFilename = (name = "") => BLOCKED_EXTENSIONS.has(path.extname(name).toLowerCase());
const isAllowedLearningResource = (file = {}) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const allowedMime = LEARNING_RESOURCE_MIME_TYPES.has(mimeType) ||
    /^(image|audio|video)\//.test(mimeType);
  return LEARNING_RESOURCE_EXTENSIONS.has(extension) && allowedMime;
};

const hasDangerousSignature = async (filePath) => {
  const handle = await require("fs").promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);
    const textHeader = header.toString("utf8");
    return (
      (header[0] === 0x4d && header[1] === 0x5a) || // Windows PE
      (header[0] === 0x7f && header.subarray(1, 4).toString() === "ELF") ||
      textHeader.startsWith("#!") ||
      /<script\b|powershell\b|@echo\s+off/i.test(textHeader)
    );
  } finally {
    await handle.close();
  }
};

const scanFile = async (filePath) => {
  if (await hasDangerousSignature(filePath)) {
    return { safe: false, status: "dangerous_signature" };
  }
  if (!process.env.CLAMAV_BIN) {
    if (process.env.REQUIRE_FILE_SCANNING === "true") {
      throw new Error("File security scanner is required but unavailable");
    }
    return { safe: true, status: "signature_checked" };
  }
  try {
    await execFileAsync(process.env.CLAMAV_BIN, ["--no-summary", filePath], { timeout: 120_000, windowsHide: true });
    return { safe: true, status: "clean" };
  } catch (error) {
    if (error.code === 1) return { safe: false, status: "infected" };
    throw new Error("File security scanner is unavailable");
  }
};

const extensionAllowed = (filename, allowedFileTypes = []) => {
  if (!Array.isArray(allowedFileTypes) || !allowedFileTypes.length) return true;
  const extension = path.extname(filename).toLowerCase().replace(/^\./, "");
  return allowedFileTypes.map((item) => String(item).toLowerCase().replace(/^\./, "")).includes(extension);
};

module.exports = { BLOCKED_EXTENSIONS, LEARNING_RESOURCE_EXTENSIONS, isDangerousFilename, isAllowedLearningResource, hasDangerousSignature, scanFile, extensionAllowed };
