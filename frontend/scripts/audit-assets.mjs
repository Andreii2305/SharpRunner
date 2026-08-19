import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public/game/assets");
const MAX_FILES = 9_500;
const MAX_BYTES = 42 * 1024 * 1024;

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    const details = await stat(target);
    return [{ path: target, bytes: details.size }];
  }));
  return nested.flat();
};

const files = await walk(root);
const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
const megabytes = (bytes / 1024 / 1024).toFixed(1);

if (files.length > MAX_FILES || bytes > MAX_BYTES) {
  throw new Error(
    `Game asset budget exceeded: ${files.length}/${MAX_FILES} files, ${megabytes}/42 MB`,
  );
}

console.log(`Asset audit passed: ${files.length} files, ${megabytes} MB.`);
