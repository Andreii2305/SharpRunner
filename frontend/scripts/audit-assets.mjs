import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public/game/assets");
const MAX_FILES = 9_500;
const MAX_BYTES = 42 * 1024 * 1024;
const MAX_BGM_BYTES = 40 * 1024 * 1024;
const bgmRoot = path.join(root, "sounds", "bgm");
const expectedBgmFiles = new Set([
  "bgm_tutorial.mp3",
  "bgm_malumay.mp3",
  "bgm_ritual.mp3",
  "bgm_encounter.mp3",
  "bgm_ancient_spirits.mp3",
  "bgm_cemetery.mp3",
  "bgm_bakunawa.mp3",
]);

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
const bgmFiles = files.filter((file) => path.dirname(file.path) === bgmRoot);
const eagerFiles = files.filter((file) => path.dirname(file.path) !== bgmRoot);
const bytes = eagerFiles.reduce((sum, file) => sum + file.bytes, 0);
const bgmBytes = bgmFiles.reduce((sum, file) => sum + file.bytes, 0);
const megabytes = (bytes / 1024 / 1024).toFixed(1);
const bgmMegabytes = (bgmBytes / 1024 / 1024).toFixed(1);
const actualBgmFiles = new Set(bgmFiles.map((file) => path.basename(file.path)));
const missingBgmFiles = [...expectedBgmFiles].filter((file) => !actualBgmFiles.has(file));
const unexpectedBgmFiles = [...actualBgmFiles].filter((file) => !expectedBgmFiles.has(file));

if (files.length > MAX_FILES || bytes > MAX_BYTES) {
  throw new Error(
    `Game asset budget exceeded: ${files.length}/${MAX_FILES} files, ${megabytes}/42 MB eager assets`,
  );
}

if (bgmBytes > MAX_BGM_BYTES || missingBgmFiles.length || unexpectedBgmFiles.length) {
  throw new Error(
    `BGM asset audit failed: ${bgmMegabytes}/40 MB, missing [${missingBgmFiles.join(", ")}], unexpected [${unexpectedBgmFiles.join(", ")}]`,
  );
}

console.log(
  `Asset audit passed: ${files.length} files, ${megabytes} MB eager assets, ${bgmMegabytes} MB lazy BGM.`,
);
