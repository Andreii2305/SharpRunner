const {
  FAILURE_GUIDANCE,
  GLOBAL_FAILURE_GUIDANCE,
  getFallbackHint,
  getLevelHintProfile,
} = require("../constants/levelSituationalHintCatalog");
const {
  STRONGER_GUIDANCE_FAILURE_OFFSET,
} = require("../constants/gamificationConfig");

const normalizeStage = (stage) => stage === "stronger" ? "stronger" : "personalized";

const getProgressiveHintStage = ({ unlocked, attemptCount, purchaseAttemptCount }) => {
  if (!unlocked) return null;
  const currentAttempts = Math.max(0, Number(attemptCount) || 0);
  const purchasedAtAttempts = Math.max(0, Number(purchaseAttemptCount) || 0);
  return currentAttempts >= purchasedAtAttempts + STRONGER_GUIDANCE_FAILURE_OFFSET
    ? "stronger"
    : "personalized";
};

const renderLevelFailureHint = (definition, stage, metadata) => {
  const value = definition?.[stage];
  return typeof value === "function" ? value(metadata ?? {}) : value;
};

const resolvePersonalizedHint = ({ levelKey, failureCode, category, metadata = {}, stage }) => {
  const profile = getLevelHintProfile(levelKey);
  if (!profile) return null;
  const normalizedStage = normalizeStage(stage);
  const globalGuidance = GLOBAL_FAILURE_GUIDANCE[failureCode];
  const supported = Boolean(globalGuidance)
    || profile.supportedFailureCodes.includes(failureCode);
  if (!supported) {
    if (process.env.NODE_ENV !== "test") {
      console.debug(`Unsupported hint failure code ${failureCode || "UNKNOWN"} for ${levelKey}; using level fallback.`);
    }
    return {
      text: getFallbackHint(levelKey, normalizedStage),
      stage: normalizedStage,
      failureCode: failureCode || "UNKNOWN",
      category: category || "unknown",
      fallbackUsed: true,
    };
  }

  const levelSpecificText = renderLevelFailureHint(
    profile.failures?.[failureCode],
    normalizedStage,
    metadata,
  );
  if (levelSpecificText) {
    return {
      text: levelSpecificText,
      stage: normalizedStage,
      failureCode: failureCode || "UNKNOWN",
      category: category || "unknown",
      fallbackUsed: false,
    };
  }

  const guidance = globalGuidance ?? FAILURE_GUIDANCE[failureCode];
  const fallbackUsed = !guidance;

  if (fallbackUsed) {
    return {
      text: getFallbackHint(levelKey, normalizedStage),
      stage: normalizedStage,
      failureCode: failureCode || "UNKNOWN",
      category: category || "unknown",
      fallbackUsed: true,
    };
  }

  const [issue, reminder, action] = guidance;
  const text = normalizedStage === "stronger"
    ? `${issue}\n\nFocus on: ${profile.strongerFocus}\n\n${reminder}\n\nTry this next: ${action}`
    : `${profile.positive}\n\n${issue}\n\nLook at: ${profile.location}.\n\n${reminder}\n\nNext: ${action}`;
  return {
    text,
    stage: normalizedStage,
    failureCode: failureCode || "UNKNOWN",
    category: category || "unknown",
    fallbackUsed: false,
  };
};

module.exports = { getProgressiveHintStage, resolvePersonalizedHint };
