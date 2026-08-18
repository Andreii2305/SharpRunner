const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const OFFICE_EXTENSIONS = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp"]);
const isOfficeDocument = (name = "") => OFFICE_EXTENSIONS.has(path.extname(name).toLowerCase());

const convertOfficeToPdf = async (buffer, originalName) => {
  if (!isOfficeDocument(originalName)) return null;
  const tempDirectory = path.join(os.tmpdir(), `sharprunner-preview-${crypto.randomUUID()}`);
  await fs.promises.mkdir(tempDirectory, { recursive: true });
  const inputPath = path.join(tempDirectory, path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_") || "document.docx");
  try {
    await fs.promises.writeFile(inputPath, buffer);
    await execFileAsync(process.env.LIBREOFFICE_BIN || "soffice", ["--headless", "--convert-to", "pdf", "--outdir", tempDirectory, inputPath], { timeout: 60_000, windowsHide: true });
    const outputPath = path.join(tempDirectory, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
    return await fs.promises.readFile(outputPath);
  } catch { return null; }
  finally { await fs.promises.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined); }
};

module.exports = { isOfficeDocument, convertOfficeToPdf };
