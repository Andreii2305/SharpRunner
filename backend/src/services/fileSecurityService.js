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
const LEARNING_RESOURCE_MIME_TYPES_BY_EXTENSION = new Map([
  [".pdf", new Set(["application/pdf"])],
  [".png", new Set(["image/png"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".gif", new Set(["image/gif"])],
  [".webp", new Set(["image/webp"])],
  [".ppt", new Set(["application/vnd.ms-powerpoint"])],
  [".pptx", new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"])],
  [".doc", new Set(["application/msword"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".odt", new Set(["application/vnd.oasis.opendocument.text"])],
  [".odp", new Set(["application/vnd.oasis.opendocument.presentation"])],
  [".txt", new Set(["text/plain"])],
  [".rtf", new Set(["application/rtf", "text/rtf"])],
  [".csv", new Set(["text/csv", "application/csv"])],
  [".xls", new Set(["application/vnd.ms-excel"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".ods", new Set(["application/vnd.oasis.opendocument.spreadsheet"])],
  [".mp4", new Set(["video/mp4"])],
  [".webm", new Set(["video/webm"])],
  [".mp3", new Set(["audio/mpeg", "audio/mp3"])],
  [".wav", new Set(["audio/wav", "audio/x-wav"])],
  [".ogg", new Set(["audio/ogg", "video/ogg"])],
]);
const isDangerousFilename = (name = "") => BLOCKED_EXTENSIONS.has(path.extname(name).toLowerCase());
const isAllowedLearningResource = (file = {}) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const allowedMimeTypes = LEARNING_RESOURCE_MIME_TYPES_BY_EXTENSION.get(extension);
  return LEARNING_RESOURCE_EXTENSIONS.has(extension) && Boolean(allowedMimeTypes?.has(mimeType));
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
