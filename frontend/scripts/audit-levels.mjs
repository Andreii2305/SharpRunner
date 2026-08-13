import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "src/pages/game/levels/levelConfigs.js");
const source = readFileSync(configPath, "utf8");
const configuredLevels = [...source.matchAll(/levelNumber:\s*(\d+)/g)].map((match) => Number(match[1]));
const uniqueLevels = new Set(configuredLevels);
const combinedCurriculumLevels = new Set([25]); // Level 24 intentionally covers curriculum levels 24-25.
const missing = Array.from({ length: 30 }, (_, index) => index + 1).filter(
  (level) => !uniqueLevels.has(level) && !combinedCurriculumLevels.has(level),
);
const duplicateLevels = configuredLevels.filter(
  (level, index) => configuredLevels.indexOf(level) !== index,
);
const sceneImports = [...source.matchAll(/import\s+\w+\s+from\s+"(\.\.\/scenes\/[^"]+)"/g)]
  .map((match) => resolve(root, "src/pages/game/levels", `${match[1]}.js`));
const missingScenes = sceneImports.filter((path) => !existsSync(path));

if (missing.length || duplicateLevels.length || missingScenes.length) {
  if (missing.length) console.error(`Missing levels: ${missing.join(", ")}`);
  if (duplicateLevels.length) console.error(`Duplicate levels: ${duplicateLevels.join(", ")}`);
  if (missingScenes.length) console.error(`Missing scenes:\n${missingScenes.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Level audit passed: ${uniqueLevels.size} routes cover levels 1-30 (Level 24 covers 24-25), with ${sceneImports.length} scene modules.`);
}
