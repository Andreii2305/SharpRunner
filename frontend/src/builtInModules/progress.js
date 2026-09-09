import { getUser } from "../utils/auth.js";

const VERSION = 1;
const PREFIX = "sharprunner:built-in-module-progress";

const userScope = () => {
  const user = getUser();
  return user?.id ?? user?.userId ?? user?.username ?? "guest";
};

const storageKey = (moduleId) => `${PREFIX}:v${VERSION}:${userScope()}:${moduleId}`;

export const emptyModuleProgress = (moduleId) => ({
  moduleId, completedSectionIds: [], completedCheckIds: [], lastSectionId: null, completedAt: null,
});

export function readModuleProgress(moduleId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(moduleId)) || "null");
    if (!parsed || parsed.moduleId !== moduleId) return emptyModuleProgress(moduleId);
    return { ...emptyModuleProgress(moduleId), ...parsed };
  } catch {
    return emptyModuleProgress(moduleId);
  }
}

export function writeModuleProgress(moduleId, progress) {
  localStorage.setItem(storageKey(moduleId), JSON.stringify({ ...progress, moduleId }));
}

export function calculateModulePercent(module, progress) {
  if (!module?.sections?.length) return 0;
  const checkIds = module.sections.flatMap((section) => section.blocks.filter(({ type }) => type === "check").map(({ id }) => id));
  const completedSections = new Set(progress?.completedSectionIds ?? []).size;
  const completedChecks = checkIds.filter((id) => progress?.completedCheckIds?.includes(id)).length;
  return Math.round(((completedSections + completedChecks) / (module.sections.length + checkIds.length)) * 100);
}
