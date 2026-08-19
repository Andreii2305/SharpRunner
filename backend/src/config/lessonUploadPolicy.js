const maxFiles = Math.min(Math.max(Number(process.env.LESSON_UPLOAD_MAX_FILES) || 5, 1), 10);
const maxFileSizeMb = Math.min(Math.max(Number(process.env.LESSON_UPLOAD_MAX_MB) || 25, 1), 100);

module.exports = Object.freeze({
  maxFiles,
  maxFileSizeMb,
  maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
});
