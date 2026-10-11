export const DASHBOARD_REGION_KEYS = Object.freeze([
  "tutorial",
  "arrays",
  "functions",
  "functions-with-arrays",
  "final",
]);

const REGION_PRESENTATION = {
  tutorial: {
    label: "First Compile Trial",
    topic: "Tutorial",
    accent: "#5f5e5a",
    fill: "#D3D1C7",
    pixelColor: "#888780",
    letter: "T",
  },
  arrays: {
    label: "Barangay Malumay",
    topic: "Arrays",
    accent: "#854F0B",
    fill: "#FAC775",
    pixelColor: "#EF9F27",
    letter: "A",
  },
  functions: {
    label: "Kapre's Trail",
    topic: "Functions and Methods",
    accent: "#534AB7",
    fill: "#CECBF6",
    pixelColor: "#AFA9EC",
    letter: "F",
  },
  "functions-with-arrays": {
    label: "Tikbalang Crossing",
    topic: "Functions with Arrays",
    accent: "#185FA5",
    fill: "#B5D4F4",
    pixelColor: "#85B7EB",
    letter: "FA",
  },
  final: {
    label: "Bakunawa Eclipse",
    topic: "Final Challenge",
    accent: "#0F6E56",
    fill: "#C8EFE2",
    pixelColor: "#5FC99F",
    letter: "B",
  },
};

export const DASHBOARD_GAME_REGIONS = DASHBOARD_REGION_KEYS.map((key) => ({
  key,
  ...REGION_PRESENTATION[key],
}));

const nonNegativeInteger = (value) => {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const boundedPercentage = (value) => {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const unavailableOverall = (countText) => ({
  label: "Game progress",
  percentageText: "—",
  countText,
  compactCountText: countText,
  progressPercent: null,
  hasApplicableActivities: false,
});

export const createDashboardProgressDisplay = (progress) => {
  const summary = progress?.summary;
  const total = nonNegativeInteger(summary?.totalLevels);
  const completed = nonNegativeInteger(
    summary?.totalLevelsCleared ?? summary?.completedLevels,
  );
  const progressPercent = boundedPercentage(summary?.overallProgress);

  if (!summary || total == null || completed == null || progressPercent == null) {
    return unavailableOverall("Progress unavailable");
  }
  if (total === 0) return unavailableOverall("No applicable game activities");

  const activityNoun = total === 1 ? "activity" : "activities";
  return {
    label: "Game progress",
    percentageText: `${progressPercent}%`,
    countText: `${completed} of ${total} game ${activityNoun} completed`,
    compactCountText: `${completed} / ${total} game ${activityNoun}`,
    progressPercent,
    hasApplicableActivities: true,
  };
};

const unavailableRegion = (countText) => ({
  countText,
  progressPercent: null,
  isCompleted: false,
  hasApplicableActivities: false,
  availability: "not-applicable",
});

export const createDashboardRegionProgressDisplay = (progress, lessonKey) => {
  if (!progress?.summary || !Array.isArray(progress.lessons)) {
    return unavailableRegion("Progress unavailable");
  }

  const lesson = progress.lessons.find((candidate) => candidate?.lessonKey === lessonKey);
  if (!lesson) return unavailableRegion("No applicable game activities");

  const total = nonNegativeInteger(lesson.totalLevels);
  if (total === 0) return unavailableRegion("No applicable game activities");
  const completed = nonNegativeInteger(
    lesson.completedLevels ?? lesson.levelsCleared,
  );
  const progressPercent = boundedPercentage(lesson.progressPercent);
  if (total == null || completed == null || progressPercent == null) {
    return unavailableRegion("Progress unavailable");
  }
  return {
    countText: `${completed} / ${total}`,
    progressPercent,
    isCompleted: completed >= total,
    hasApplicableActivities: true,
    availability: lesson.gameUnlocked === true
      ? "available"
      : lesson.gameUnlocked === false
        ? "locked"
        : "unknown",
  };
};

export const createDashboardRegionTileDisplays = (progress) => {
  const displays = DASHBOARD_REGION_KEYS.map((lessonKey) => ({
    lessonKey,
    ...createDashboardRegionProgressDisplay(progress, lessonKey),
  }));

  return displays.map((display) => {
    const locked = display.availability === "locked";
    const statusText = !display.hasApplicableActivities
      ? display.countText
      : display.availability === "unknown"
        ? `${display.countText} · Availability unavailable`
        : locked
          ? `${display.countText} · Locked`
          : display.isCompleted
            ? `✓ ${display.countText} · Completed`
            : `${display.countText} · In progress`;

    return { ...display, locked, statusText };
  });
};
