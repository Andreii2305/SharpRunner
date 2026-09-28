import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_CANONICAL_CONTENT_PATH = path.resolve(
  FRONTEND_ROOT,
  "../backend/src/data/builtInLessonContent.v1.json",
);

const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const SOURCE_TOP_LEVEL_DIRECTORIES = new Set(["src", "public", "scripts"]);
const SOURCE_ROOT_FILES = new Set(["index.html", "package.json"]);
const SOURCE_EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "__tests__",
  "fixtures",
  "fixture",
]);

export const FORBIDDEN_LEGACY_REFERENCES = Object.freeze([
  { label: "getBuiltInModule", value: "getBuiltInModule" },
  { label: "builtInModuleById", value: "builtInModuleById" },
  { label: "builtInModules/tutorial", value: "builtInModules/tutorial" },
  { label: "builtInModules/arrays", value: "builtInModules/arrays" },
  { label: "builtInModules/functions", value: "builtInModules/functions" },
  { label: "builtInModules/functionsWithArrays", value: "builtInModules/functionsWithArrays" },
  { label: "builtInModules/finalReview", value: "builtInModules/finalReview" },
  { label: "builtInModules/index", value: "builtInModules/index" },
  { label: "builtInModules/moduleHelpers", value: "builtInModules/moduleHelpers" },
]);

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function safePreview(value, maxLength = 36) {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

function distinctiveFragment(value, maxLength = 96) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (normalized.length < 12) {
    throw new Error("Protected-content sentinel is too short to be distinctive");
  }

  if (normalized.length <= maxLength) return normalized;

  const candidate = normalized.slice(0, maxLength);
  const lastBoundary = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\n"));
  return lastBoundary >= 48 ? candidate.slice(0, lastBoundary) : candidate;
}

function textPatterns(value) {
  const fragment = distinctiveFragment(value);
  const escaped = JSON.stringify(fragment).slice(1, -1);
  return [...new Set([fragment, escaped])];
}

function findBlocks(lesson) {
  return lesson.sections.flatMap((section) => section.blocks);
}

function createTextSentinel({ lesson, category, label, value }) {
  const patterns = textPatterns(value);
  return {
    lesson,
    category,
    label,
    preview: safePreview(patterns[0]),
    patterns,
  };
}

function createIdSentinel({ lesson, label, value }) {
  return {
    lesson,
    category: "stable-id",
    label,
    preview: safePreview(value),
    patterns: [value],
  };
}

function createExpectedOutputSentinel({ lesson, label, value }) {
  const serializedValue = JSON.stringify(String(value));
  return {
    lesson,
    category: "expected-output",
    label,
    preview: safePreview(`expectedOutput=${value}`),
    patterns: [
      `"expectedOutput":${serializedValue}`,
      `"expectedOutput": ${serializedValue}`,
      `expectedOutput:${serializedValue}`,
      `expectedOutput: ${serializedValue}`,
      `expectedOutput:'${String(value).replaceAll("'", "\\'")}'`,
    ],
  };
}

export async function loadCanonicalSentinels({
  canonicalContentPath = DEFAULT_CANONICAL_CONTENT_PATH,
} = {}) {
  let content;
  try {
    content = JSON.parse(await readFile(canonicalContentPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to load canonical protected content: ${error.message}`);
  }

  if (!Array.isArray(content.lessons)) {
    throw new Error("Canonical protected content does not contain a lessons array");
  }

  const sentinels = [];

  for (const lesson of content.lessons) {
    const blocks = findBlocks(lesson);
    const prose = blocks.find(
      (block) => block.type === "paragraph" && typeof block.text === "string" && block.text.length >= 48,
    );
    const practice = blocks.find((block) => block.type === "practice");
    const check = blocks.find((block) => block.type === "check");

    if (!prose || !practice || !check) {
      throw new Error(`Canonical lesson ${lesson.lessonKey} lacks required sentinel material`);
    }

    sentinels.push(
      createTextSentinel({
        lesson: lesson.lessonKey,
        category: "prose",
        label: `${lesson.lessonKey}-prose`,
        value: prose.text,
      }),
      createIdSentinel({
        lesson: lesson.lessonKey,
        label: `${lesson.lessonKey}-practice-id`,
        value: practice.id,
      }),
      createIdSentinel({
        lesson: lesson.lessonKey,
        label: `${lesson.lessonKey}-check-id`,
        value: check.id,
      }),
      createTextSentinel({
        lesson: lesson.lessonKey,
        category: "solution",
        label: `${lesson.lessonKey}-solution`,
        value: practice.solution,
      }),
      createExpectedOutputSentinel({
        lesson: lesson.lessonKey,
        label: `${lesson.lessonKey}-expected-output`,
        value: practice.expectedOutput,
      }),
      createTextSentinel({
        lesson: lesson.lessonKey,
        category: "feedback",
        label: `${lesson.lessonKey}-feedback`,
        value: check.feedback,
      }),
    );
  }

  return sentinels;
}

function isProbablyText(buffer, extension) {
  if (BINARY_EXTENSIONS.has(extension.toLowerCase())) return false;
  if (buffer.includes(0)) return false;

  const sampleLength = Math.min(buffer.length, 8192);
  let controlBytes = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) controlBytes += 1;
  }

  return sampleLength === 0 || controlBytes / sampleLength < 0.02;
}

async function listFiles(
  rootDir,
  {
    shouldEnterDirectory = () => true,
    shouldScanFile = () => true,
  } = {},
) {
  let rootStats;
  try {
    rootStats = await stat(rootDir);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Audit root does not exist: ${rootDir}`);
    throw new Error(`Unable to inspect audit root ${rootDir}: ${error.message}`);
  }

  if (!rootStats.isDirectory()) {
    throw new Error(`Audit root is not a directory: ${rootDir}`);
  }

  const files = [];

  async function visit(directory, relativeDirectory = "") {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(
        `Unable to read audit directory ${normalizeRelativePath(relativeDirectory) || "."}: ${error.message}`,
      );
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const relativePath = normalizeRelativePath(path.join(relativeDirectory, entry.name));
      const absolutePath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (shouldEnterDirectory(relativePath)) {
          await visit(absolutePath, relativePath);
        }
      } else if (entry.isFile() && shouldScanFile(relativePath)) {
        files.push({ absolutePath, relativePath });
      }
    }
  }

  await visit(rootDir);
  return files;
}

function normalizeForbiddenReference(reference) {
  return typeof reference === "string"
    ? { label: reference, value: reference }
    : reference;
}

export async function scanProtectedContent({
  rootDir,
  sentinels,
  forbiddenReferences = FORBIDDEN_LEGACY_REFERENCES,
  shouldEnterDirectory,
  shouldScanFile,
}) {
  const files = await listFiles(rootDir, { shouldEnterDirectory, shouldScanFile });
  const findings = [];

  for (const file of files) {
    let buffer;
    try {
      buffer = await readFile(file.absolutePath);
    } catch (error) {
      throw new Error(`Unable to read audit file ${file.relativePath}: ${error.message}`);
    }

    if (!isProbablyText(buffer, path.extname(file.relativePath))) continue;
    const content = buffer.toString("utf8");

    for (const sentinel of sentinels) {
      if (sentinel.patterns.some((pattern) => content.includes(pattern))) {
        findings.push({
          relativePath: file.relativePath,
          kind: "protected-content",
          lesson: sentinel.lesson,
          category: sentinel.category,
          label: sentinel.label,
          preview: sentinel.preview,
        });
      }
    }

    for (const rawReference of forbiddenReferences) {
      const reference = normalizeForbiddenReference(rawReference);
      if (content.includes(reference.value)) {
        findings.push({
          relativePath: file.relativePath,
          kind: "forbidden-reference",
          lesson: "legacy",
          category: "legacy-reference",
          label: reference.label,
          preview: safePreview(reference.value),
        });
      }
    }
  }

  return findings;
}

function isExcludedSourceDirectory(relativePath) {
  const segments = relativePath.split("/");
  if (!SOURCE_TOP_LEVEL_DIRECTORIES.has(segments[0])) return true;
  return segments.some((segment) => SOURCE_EXCLUDED_DIRECTORIES.has(segment));
}

function isSourceFile(relativePath) {
  const segments = relativePath.split("/");
  const fileName = segments.at(-1);

  if (segments.length === 1) {
    return (
      SOURCE_ROOT_FILES.has(fileName) ||
      /^(?:vite|eslint)\.config\.[^.]+$/u.test(fileName)
    );
  }

  if (!SOURCE_TOP_LEVEL_DIRECTORIES.has(segments[0])) return false;
  if (segments.some((segment) => SOURCE_EXCLUDED_DIRECTORIES.has(segment))) return false;
  if (/\.(?:test|spec)\.[^/]+$/u.test(fileName)) return false;
  if (relativePath === "scripts/audit-protected-built-in-content.mjs") return false;
  return true;
}

export function scanSourceTree({
  frontendRoot = FRONTEND_ROOT,
  sentinels,
  forbiddenReferences = FORBIDDEN_LEGACY_REFERENCES,
}) {
  return scanProtectedContent({
    rootDir: frontendRoot,
    sentinels,
    forbiddenReferences,
    shouldEnterDirectory: (relativePath) => !isExcludedSourceDirectory(relativePath),
    shouldScanFile: isSourceFile,
  });
}

function parseArguments(args) {
  const modes = ["--source", "--dist"].filter((flag) => args.includes(flag));
  if (modes.length !== 1) {
    throw new Error("Usage: node scripts/audit-protected-built-in-content.mjs (--source|--dist) [--root <path>]");
  }

  const rootIndex = args.indexOf("--root");
  if (rootIndex >= 0 && !args[rootIndex + 1]) {
    throw new Error("--root requires a directory path");
  }

  const knownArguments = new Set([modes[0], "--root", ...(rootIndex >= 0 ? [args[rootIndex + 1]] : [])]);
  const unknownArgument = args.find((argument) => !knownArguments.has(argument));
  if (unknownArgument) throw new Error(`Unknown argument: ${unknownArgument}`);

  return {
    mode: modes[0] === "--source" ? "source" : "dist",
    rootOverride: rootIndex >= 0 ? path.resolve(process.cwd(), args[rootIndex + 1]) : null,
  };
}

function formatFinding(finding) {
  return [
    finding.relativePath,
    `lesson=${finding.lesson}`,
    `category=${finding.category}`,
    `sentinel=${finding.label}`,
    `preview=${JSON.stringify(finding.preview)}`,
  ].join(" | ");
}

export async function runAudit(args = process.argv.slice(2)) {
  const { mode, rootOverride } = parseArguments(args);
  const sentinels = await loadCanonicalSentinels();
  const auditRoot = rootOverride ?? (mode === "source" ? FRONTEND_ROOT : path.join(FRONTEND_ROOT, "dist"));
  const findings = mode === "source"
    ? await scanSourceTree({ frontendRoot: auditRoot, sentinels })
    : await scanProtectedContent({ rootDir: auditRoot, sentinels });

  if (findings.length > 0) {
    console.error(`Protected built-in content audit failed (${findings.length} finding(s)):`);
    for (const finding of findings) console.error(`- ${formatFinding(finding)}`);
    process.exitCode = 1;
    return findings;
  }

  console.log(`Protected built-in content ${mode} audit passed (${sentinels.length} sentinels).`);
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  runAudit().catch((error) => {
    console.error(`Protected built-in content audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
