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
const sceneSources = sceneImports
  .filter((path) => existsSync(path))
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));
const viewportDerivedWorlds = sceneSources.filter(({ source: sceneSource }) =>
  /offsetY\s*=\s*this\.scale\.height\s*-\s*(?:this\.)?map\.heightInPixels/.test(sceneSource),
);
const viewportDerivedCameraBounds = sceneSources.filter(({ source: sceneSource }) =>
  /setBounds\([^)]*this\.scale\.height/.test(sceneSource),
);
const missingMapBounds = sceneSources.filter(({ source: sceneSource }) =>
  !/setBounds\(/.test(sceneSource)
  || (!/setBounds\([^)]*map\.heightInPixels/.test(sceneSource)
    && !/worldHeight\s*=\s*map\?\.heightInPixels/.test(sceneSource)),
);
const missingMapAssets = sceneSources.flatMap(({ path, source: sceneSource }) =>
  [...sceneSource.matchAll(/\$\{ASSET_BASE\}\/maps\/([^"`]+\.tmj)/g)]
    .map((match) => resolve(root, "public/game/assets/maps", match[1]))
    .filter((mapPath) => !existsSync(mapPath))
    .map((mapPath) => `${path} -> ${mapPath}`),
);
const taskHeadings = [...source.matchAll(/^      title: "Your Task",$/gm)].length;
const importantReminders = [...source.matchAll(/^      important: /gm)].length;
const successDescriptions = [...source.matchAll(/^      success: /gm)].length;
const incompleteInstructionStructures = [
  ["Your Task headings", taskHeadings],
  ["Important reminders", importantReminders],
  ["Success descriptions", successDescriptions],
].filter(([, count]) => count !== uniqueLevels.size);

if (
  missing.length ||
  duplicateLevels.length ||
  missingScenes.length ||
  viewportDerivedWorlds.length ||
  viewportDerivedCameraBounds.length ||
  missingMapBounds.length ||
  missingMapAssets.length ||
  incompleteInstructionStructures.length
) {
  if (missing.length) console.error(`Missing levels: ${missing.join(", ")}`);
  if (duplicateLevels.length) console.error(`Duplicate levels: ${duplicateLevels.join(", ")}`);
  if (missingScenes.length) console.error(`Missing scenes:\n${missingScenes.join("\n")}`);
  if (viewportDerivedWorlds.length) console.error(`Viewport-derived world coordinates:\n${viewportDerivedWorlds.map(({ path }) => path).join("\n")}`);
  if (viewportDerivedCameraBounds.length) console.error(`Viewport-derived camera bounds:\n${viewportDerivedCameraBounds.map(({ path }) => path).join("\n")}`);
  if (missingMapBounds.length) console.error(`Scenes without map-height camera bounds:\n${missingMapBounds.map(({ path }) => path).join("\n")}`);
  if (missingMapAssets.length) console.error(`Missing scene map assets:\n${missingMapAssets.join("\n")}`);
  for (const [label, count] of incompleteInstructionStructures) {
    console.error(`${label}: expected ${uniqueLevels.size}, found ${count}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Level audit passed: ${uniqueLevels.size} routes cover levels 1-30 (Level 24 covers 24-25), with ${sceneImports.length} scene modules, stable map-space camera contracts, existing map assets, and complete Goal / Your Task / Important / Success instructions.`);
}
