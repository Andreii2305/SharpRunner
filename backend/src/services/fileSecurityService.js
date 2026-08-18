const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const BLOCKED_EXTENSIONS = new Set([".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".scr", ".vbs", ".js", ".jar", ".apk"]);
const isDangerousFilename = (name = "") => BLOCKED_EXTENSIONS.has(path.extname(name).toLowerCase());

const scanFile = async (filePath) => {
  if (!process.env.CLAMAV_BIN) return { safe: true, status: "not_configured" };
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

module.exports = { BLOCKED_EXTENSIONS, isDangerousFilename, scanFile, extensionAllowed };
