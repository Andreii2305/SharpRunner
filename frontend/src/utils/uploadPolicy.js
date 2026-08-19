export const DEFAULT_UPLOAD_POLICY = Object.freeze({ maxFiles: 5, maxFileSizeMb: 25 });

export const normalizeUploadPolicy = (policy) => ({
  maxFiles: Math.min(10, Math.max(1, Number(policy?.maxFiles) || DEFAULT_UPLOAD_POLICY.maxFiles)),
  maxFileSizeMb: Math.min(100, Math.max(1, Number(policy?.maxFileSizeMb) || DEFAULT_UPLOAD_POLICY.maxFileSizeMb)),
});

export const validateUploadFiles = (fileList, policy = DEFAULT_UPLOAD_POLICY) => {
  const files = Array.from(fileList ?? []);
  const normalized = normalizeUploadPolicy(policy);
  if (files.length > normalized.maxFiles) {
    return { files: [], error: `Choose no more than ${normalized.maxFiles} files at a time.` };
  }
  const oversized = files.find((file) => Number(file.size) > normalized.maxFileSizeMb * 1024 * 1024);
  if (oversized) {
    return { files: [], error: `${oversized.name} is larger than the ${normalized.maxFileSizeMb} MB limit.` };
  }
  return { files, error: "" };
};
