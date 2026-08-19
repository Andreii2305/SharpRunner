import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUploadPolicy, validateUploadFiles } from "./uploadPolicy.js";

test("upload policy falls back to server defaults and stays within supported bounds", () => {
  assert.deepEqual(normalizeUploadPolicy(), { maxFiles: 5, maxFileSizeMb: 25 });
  assert.deepEqual(normalizeUploadPolicy({ maxFiles: 99, maxFileSizeMb: 999 }), { maxFiles: 10, maxFileSizeMb: 100 });
});

test("upload selection rejects too many files without silently truncating", () => {
  const result = validateUploadFiles(Array.from({ length: 6 }, (_, index) => ({ name: `${index}.pdf`, size: 1 })), { maxFiles: 5, maxFileSizeMb: 25 });
  assert.equal(result.files.length, 0);
  assert.match(result.error, /no more than 5 files/);
});

test("upload selection reports the oversized filename", () => {
  const result = validateUploadFiles([{ name: "video.mp4", size: 26 * 1024 * 1024 }], { maxFiles: 5, maxFileSizeMb: 25 });
  assert.equal(result.files.length, 0);
  assert.match(result.error, /video\.mp4.*25 MB/);
});
