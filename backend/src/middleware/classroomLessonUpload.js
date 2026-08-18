const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { isDangerousFilename, scanFile } = require("../services/fileSecurityService");

const uploadDirectory = process.env.LESSON_UPLOAD_DIR
  ? path.resolve(process.env.LESSON_UPLOAD_DIR)
  : path.join(__dirname, "..", "..", "uploads", "classroom-lessons");
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).slice(0, 20).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, callback) => callback(isDangerousFilename(file.originalname) ? new multer.MulterError("BLOCKED_FILE_TYPE") : null, !isDangerousFilename(file.originalname)),
  limits: {
    files: 10,
    fileSize: 100 * 1024 * 1024,
  },
});

const uploadLessonFiles = (req, res, next) => {
  upload.array("files", 10)(req, res, async (error) => {
    if (!error) {
      try {
        for (const file of req.files || []) {
          const result = await scanFile(file.path);
          file.securityScanStatus = result.status;
          if (!result.safe) { await removeUploadedFiles(req.files); return res.status(400).json({ message: `${file.originalname} failed the security scan` }); }
        }
        return next();
      } catch (scanError) { await removeUploadedFiles(req.files); return res.status(503).json({ message: scanError.message }); }
    }
    await removeUploadedFiles(req.files);
    const message = error.code === "BLOCKED_FILE_TYPE" ? "Executable and script files are not allowed" : error.code === "LIMIT_FILE_SIZE"
      ? "Each attachment must be 100 MB or smaller"
      : error.code === "LIMIT_FILE_COUNT"
        ? "A lesson can contain up to 10 attachments"
        : "Unable to upload lesson attachments";
    return res.status(400).json({ message });
  });
};

const removeUploadedFiles = async (files = []) => {
  await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => undefined)));
};

const removeStoredFiles = async (storedNames = []) => {
  await Promise.all(storedNames.map((storedName) =>
    fs.promises.unlink(path.join(uploadDirectory, path.basename(storedName))).catch(() => undefined)
  ));
};

module.exports = { uploadDirectory, uploadLessonFiles, removeUploadedFiles, removeStoredFiles };
