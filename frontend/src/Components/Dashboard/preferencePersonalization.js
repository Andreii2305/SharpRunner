export const DEFAULT_PREFERENCES = Object.freeze({
  gamificationPreference: "progress",
  learningGameInterest: "challenges",
});

const MOTIVATION_MODES = new Set(["progress", "competition", "rewards", "story"]);
const INTEREST_MODES = new Set(["challenges", "exploration", "competition", "rewards"]);

export function normalizePreferences(profile = {}) {
  const motivation = MOTIVATION_MODES.has(profile?.gamificationPreference)
    ? profile.gamificationPreference
    : DEFAULT_PREFERENCES.gamificationPreference;
  const interest = INTEREST_MODES.has(profile?.learningGameInterest)
    ? profile.learningGameInterest
    : DEFAULT_PREFERENCES.learningGameInterest;

  return {
    gamificationPreference: motivation,
    learningGameInterest: interest,
  };
}

export function resolvePreferenceModes(profile = {}) {
  const normalized = normalizePreferences(profile);
  const interestMode = {
    challenges: "challenges",
    exploration: "story",
    competition: "competition",
    rewards: "rewards",
  }[normalized.learningGameInterest];

  return {
    ...normalized,
    primaryMode: normalized.gamificationPreference,
    secondaryMode:
      interestMode === normalized.gamificationPreference ? "progress" : interestMode,
  };
}
