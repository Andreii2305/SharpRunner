import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public/game/assets");
const MAX_FILES = 9_500;
const MAX_BYTES = 42 * 1024 * 1024;
const MAX_BGM_BYTES = 40 * 1024 * 1024;
const MAX_SFX_BYTES = 8 * 1024 * 1024;
const bgmRoot = path.join(root, "sounds", "bgm");
const sfxRoot = path.join(root, "sounds", "sfx");
const expectedBgmFiles = new Set([
  "bgm_tutorial.mp3",
  "bgm_malumay.mp3",
  "bgm_ritual.mp3",
  "bgm_encounter.mp3",
  "bgm_ancient_spirits.mp3",
  "bgm_cemetery.mp3",
  "bgm_bakunawa.mp3",
]);
const expectedSfxFiles = new Set([
  "boss_hit.mp3", "enemy_retreat.mp3", "energy_charge.mp3", "error_magic.wav",
  "fire.mp3", "fire_extinguish.mp3", "fire_ignite.mp3", "ghost_fade.wav",
  "heal.mp3", "impact_soft.wav", "item_collect.mp3", "magic_activate.wav",
  "magic_pulse.mp3", "medium-text-blip-dialogue.mp3", "moon_restore.mp3",
  "object_shake.mp3", "scan.mp3", "scan_error.mp3", "shield_hit.mp3",
  "spirit_release.mp3", "step_spawn.mp3", "success_magic.wav",
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
const sfxFiles = files.filter((file) => path.dirname(file.path) === sfxRoot);
const eagerFiles = files.filter((file) => ![bgmRoot, sfxRoot].includes(path.dirname(file.path)));
const bytes = eagerFiles.reduce((sum, file) => sum + file.bytes, 0);
const bgmBytes = bgmFiles.reduce((sum, file) => sum + file.bytes, 0);
const sfxBytes = sfxFiles.reduce((sum, file) => sum + file.bytes, 0);
const megabytes = (bytes / 1024 / 1024).toFixed(1);
const bgmMegabytes = (bgmBytes / 1024 / 1024).toFixed(1);
const sfxMegabytes = (sfxBytes / 1024 / 1024).toFixed(1);
const actualBgmFiles = new Set(bgmFiles.map((file) => path.basename(file.path)));
const missingBgmFiles = [...expectedBgmFiles].filter((file) => !actualBgmFiles.has(file));
const unexpectedBgmFiles = [...actualBgmFiles].filter((file) => !expectedBgmFiles.has(file));
const actualSfxFiles = new Set(sfxFiles.map((file) => path.basename(file.path)));
const missingSfxFiles = [...expectedSfxFiles].filter((file) => !actualSfxFiles.has(file));
const unexpectedSfxFiles = [...actualSfxFiles].filter((file) => !expectedSfxFiles.has(file));

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

if (sfxBytes > MAX_SFX_BYTES || missingSfxFiles.length || unexpectedSfxFiles.length) {
  throw new Error(
    `SFX asset audit failed: ${sfxMegabytes}/8 MB, missing [${missingSfxFiles.join(", ")}], unexpected [${unexpectedSfxFiles.join(", ")}]`,
  );
}

console.log(
  `Asset audit passed: ${files.length} files, ${megabytes} MB non-audio eager assets, ${sfxMegabytes} MB gameplay/dialogue SFX, ${bgmMegabytes} MB lazy BGM.`,
);
