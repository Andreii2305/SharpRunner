const router = require("express").Router();
const UserProgress = require("../models/UserProgress");
const User = require("../models/User");
const HintFeedback = require("../models/HintFeedback");
const authMiddleware = require("../middleware/authMiddleware");
const requireActiveClassMembership = require("../middleware/requireActiveClassMembership");
const {
  ensureProgressRowsForUser,
  buildProgressSummary,
  getParTimeSeconds,
  computeFinalScore,
} = require("../services/progressService");
const { StudentLevelExtension } = require("../models");
const {
  findPrimaryActiveMembership,
  buildClassroomLeaderboard,
} = require("../services/studentClassService");
const {
  PLAYABLE_LEVEL_KEYS,
} = require("../constants/progressDefaults");
const {
  getClassroomLevelSettings,
} = require("../services/classroomLevelSettingsService");
const { validateLevelCode } = require("../services/levelCodeValidationService");
const {
  GamificationError,
  awardFirstCompletionXp,
  purchaseDetailedHint,
} = require("../services/gamificationService");
const {
  DEFAULT_HINT_UNLOCK_THRESHOLD,
  DETAILED_HINT_XP_COST,
} = require("../constants/gamificationConfig");
const { getLevelHints } = require("../constants/levelHintCatalog");
const {
  getProgressiveHintStage,
  resolvePersonalizedHint,
} = require("../services/hintResolverService");
const {
  evaluateStudentLevelAccess,
  getStudentLevelAccess,
  restrictionPayload,
} = require("../services/levelAccessService");
const {
  HEARTBEAT_INTERVAL_SECONDS,
  heartbeatProgressSession,
  pauseOtherLevelSessions,
  pauseProgressSession,
  startProgressSession,
} = require("../services/activeLevelTimerService");
const {
  buildEventDedupeKey,
  findRecordedEvent,
  normalizeActionId,
  recordFailedAttempt,
  recordHintUsed,
  recordLevelCompleted,
} = require("../services/learningAnalyticsEventService");

const LEVEL_KEYS = new Set(PLAYABLE_LEVEL_KEYS);

const buildHintState = (levelRow, setting = {}, currentXp = null) => {
  const threshold = Number.isInteger(Number(setting.hintUnlockThreshold))
    ? Number(setting.hintUnlockThreshold)
    : DEFAULT_HINT_UNLOCK_THRESHOLD;
  const hintsEnabled = setting.hintsEnabled !== false;
  const attemptCount = Math.max(0, Number(levelRow?.attemptCount) || 0);
  const hintUnlocked = hintsEnabled && attemptCount >= threshold;
  const detailedHintUnlocked = Boolean(levelRow?.detailedHintUnlocked);
  const hintDefinition = getLevelHints(levelRow?.levelKey);
  const purchaseAttemptCount = Number.isFinite(Number(levelRow?.detailedHintAttemptCount))
    ? Number(levelRow.detailedHintAttemptCount)
    : Number.isFinite(Number(levelRow?.attemptCountAtHintUnlock))
      ? Number(levelRow.attemptCountAtHintUnlock)
      : attemptCount;
  const resolvedStage = getProgressiveHintStage({
    unlocked: detailedHintUnlocked,
    attemptCount,
    purchaseAttemptCount,
  });
  const strongerGuidanceAvailable = resolvedStage === "stronger";
  const resolvedHint = detailedHintUnlocked
    ? resolvePersonalizedHint({
        levelKey: levelRow?.levelKey,
        failureCode: levelRow?.latestFailureCode ?? "UNKNOWN",
        category: levelRow?.latestFailureCategory ?? "unknown",
        metadata: levelRow?.latestFailureMetadata ?? {},
        stage: resolvedStage,
      })
    : null;
  return {
    hintsEnabled,
    hintUnlockThreshold: threshold,
    hintUnlocked,
    hintUsed: Boolean(levelRow?.hintUsed),
    hintUsedAt: levelRow?.hintUsedAt ?? null,
    hintType: levelRow?.hintType ?? null,
    attemptsRemaining: hintsEnabled ? Math.max(0, threshold - attemptCount) : null,
    detailedHintXpCost: DETAILED_HINT_XP_COST,
    detailedHintUnlocked,
    detailedHintPurchasedAt: levelRow?.detailedHintPurchasedAt ?? null,
    currentXp: Number.isFinite(Number(currentXp))
      ? Math.max(0, Number(currentXp))
      : null,
    basicHint: hintUnlocked ? hintDefinition?.basicHint ?? null : null,
    detailedHint: hintsEnabled ? resolvedHint?.text ?? null : null,
    personalizedHint: hintsEnabled ? resolvedHint?.text ?? null : null,
    hintStage: resolvedHint?.stage ?? null,
    failureCode: resolvedHint?.failureCode ?? levelRow?.latestFailureCode ?? null,
    failureCategory: resolvedHint?.category ?? levelRow?.latestFailureCategory ?? null,
    failureMetadata: levelRow?.latestFailureMetadata ?? {},
    fallbackHintUsed: Boolean(resolvedHint?.fallbackUsed),
    strongerGuidanceAvailable,
  };
};

const normalizeLevelKey = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const findLevelAccessRestriction = async (userId, levelKey, membership = null) => {
  const access = await getStudentLevelAccess({ userId, levelKey, membership });
  return access.allowed ? null : restrictionPayload(access);
};

const readActionId = (value) => {
  try {
    return { value: normalizeActionId(value) };
  } catch (error) {
    return { error: error.message };
  }
};

const sendLevelRestrictionResponse = (res, restriction) =>
  res.status(403).json(restriction);

const parseProgressValue = (value) => {
  if (value === undefined) {
    return { hasValue: false, value: null };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { hasValue: true, error: "progressPercent must be a number" };
  }

  if (parsed < 0 || parsed > 100) {
    return {
      hasValue: true,
      error: "progressPercent must be between 0 and 100",
    };
  }

  return {
    hasValue: true,
    value: Math.round(parsed),
  };
};

router.use(authMiddleware, requireActiveClassMembership);

const buildProgressPayloadForUser = async (userId) => {
  const rows = await ensureProgressRowsForUser(userId);
  const currentUser = await User.findByPk(userId, { attributes: ["xpTotal"] });
  let classRank = null;
  let classSize = null;

  const primaryMembership = await findPrimaryActiveMembership(userId);
  if (primaryMembership) {
    const leaderboardData = await buildClassroomLeaderboard({
      classroomId: primaryMembership.classroomId,
      currentUserId: userId,
      limit: null,
    });
    classRank = leaderboardData.currentUserRank;
    classSize = leaderboardData.classSize;
  }

  const levelSettings = await getClassroomLevelSettings(
    primaryMembership?.classroomId,
  );
  const rowByKey = new Map(rows.map((row) => [row.levelKey, row]));
  const enabledSettings = levelSettings.filter((setting) => setting.isEnabled);
  const activeRows = enabledSettings
    .map((setting) => rowByKey.get(setting.levelKey))
    .filter(Boolean);
  const payload = buildProgressSummary(activeRows, {
    classRank,
    classSize,
    xpTotal: currentUser?.xpTotal ?? 0,
  });
  const settingsByKey = new Map(
    enabledSettings.map((setting) => [setting.levelKey, setting]),
  );
  const extensionRows = primaryMembership && enabledSettings.some((setting) => setting.dueAt)
    ? await StudentLevelExtension.findAll({
        where: { classroomId: primaryMembership.classroomId, studentId: userId },
      })
    : [];
  const extensionByKey = new Map(extensionRows.map((row) => [row.levelKey, row]));
  const activeProgressByKey = new Map(activeRows.map((row) => [row.levelKey, row]));

  payload.levels = payload.levels.map((level, index) => {
    const setting = settingsByKey.get(level.levelKey);
    const access = evaluateStudentLevelAccess({
      levelKey: level.levelKey,
      settings: enabledSettings,
      progressByKey: activeProgressByKey,
      extensionDueAt: extensionByKey.get(level.levelKey)?.extendedDueAt ?? null,
    });
    return {
      ...level,
      displayOrder: setting?.displayOrder ?? index + 1,
      unlockAt: setting?.unlockAt ?? null,
      dueAt: setting?.dueAt ?? null,
      hintsEnabled: setting?.hintsEnabled ?? true,
      hintUnlockThreshold:
        setting?.hintUnlockThreshold ?? DEFAULT_HINT_UNLOCK_THRESHOLD,
      wrongAttemptDeduction: setting?.wrongAttemptDeduction ?? 5,
      lateDeductionPerDay: setting?.lateDeductionPerDay ?? 3,
      classDueAt: access.classDueAt,
      extensionDueAt: access.extensionDueAt,
      effectiveDueAt: access.effectiveDueAt,
      hasExtension: access.hasExtension,
      prerequisiteLevelKey: access.prerequisiteLevelKey ?? null,
      isAccessible: access.allowed,
      accessReason: access.reason,
      lockReason: access.reason === "DEADLINE_PASSED"
        ? "deadline"
        : access.reason === "LEVEL_SCHEDULED"
          ? "scheduled"
          : access.reason === "LEVEL_LOCKED"
            ? "prerequisite"
            : null,
      ...buildHintState(level, setting, currentUser?.xpTotal),
    };
  });

  return payload;
};

router.get("/me", async (req, res) => {
  try {
    return res.json(await buildProgressPayloadForUser(req.userId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/level/:levelKey/start", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }

    await ensureProgressRowsForUser(req.userId);

    const sessionAction = readActionId(req.body?.sessionId);
    if (sessionAction.error) return res.status(400).json({ message: sessionAction.error });
    const membership = await findPrimaryActiveMembership(req.userId);
    const access = await getStudentLevelAccess({
      userId: req.userId,
      levelKey,
      membership,
    });
    if (!access.allowed) {
      return sendLevelRestrictionResponse(res, restrictionPayload(access));
    }

    const levelRow = await UserProgress.findOne({
      where: { userId: req.userId, levelKey },
    });
    if (!levelRow) {
      return res.status(404).json({ message: "Progress row not found" });
    }

    const currentUser = await User.findByPk(req.userId, {
      attributes: ["xpTotal"],
    });

    if (levelRow.isCompleted) {
      // Replays keep the first-completion timing analytics unchanged.
      return res.json({
        activeSeconds: levelRow.timeSpentSeconds ?? 0,
        attemptCount: levelRow.attemptCount ?? 0,
        ephemeral: true,
        effectiveDueAt: access.effectiveDueAt,
        hasExtension: access.hasExtension,
        ...buildHintState(
          levelRow,
          (await getClassroomLevelSettings(
            membership?.classroomId,
          )).find((row) => row.levelKey === levelKey),
          currentUser?.xpTotal,
        ),
      });
    }

    const now = new Date();
    const analyticsContext = {
      studentId: req.userId,
      classroomId: membership?.classroomId ?? null,
      syncId: sessionAction.value,
    };
    await pauseOtherLevelSessions(req.userId, levelKey, now, analyticsContext);
    const timer = await startProgressSession(levelRow, sessionAction.value, now, analyticsContext);

    const setting = (await getClassroomLevelSettings(membership?.classroomId))
      .find((row) => row.levelKey === levelKey);
    if (timer.completed) {
      return res.json({
        activeSeconds: timer.activeSeconds,
        attemptCount: levelRow.attemptCount ?? 0,
        ephemeral: true,
        effectiveDueAt: access.effectiveDueAt,
        hasExtension: access.hasExtension,
        ...buildHintState(levelRow, setting, currentUser?.xpTotal),
      });
    }
    return res.json({
      ...timer,
      attemptCount: levelRow.attemptCount,
      ephemeral: false,
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      effectiveDueAt: access.effectiveDueAt,
      hasExtension: access.hasExtension,
      ...buildHintState(levelRow, setting, currentUser?.xpTotal),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/level/:levelKey/heartbeat", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) return res.status(404).json({ message: "Unknown level key" });
    const levelRow = await UserProgress.findOne({ where: { userId: req.userId, levelKey } });
    if (!levelRow) return res.status(404).json({ message: "Progress row not found" });
    const syncAction = readActionId(req.body?.syncId);
    if (syncAction.error) return res.status(400).json({ message: syncAction.error });

    const now = new Date();
    const membership = await findPrimaryActiveMembership(req.userId);
    const analyticsContext = {
      studentId: req.userId,
      classroomId: membership?.classroomId ?? null,
      syncId: syncAction.value,
    };
    const access = await getStudentLevelAccess({
      userId: req.userId,
      levelKey,
      membership,
      now,
    });
    if (!access.allowed || levelRow.isCompleted) {
      if (levelRow.activeSessionId) {
        await pauseProgressSession(levelRow, {
          now,
          stopAt: access.reason === "DEADLINE_PASSED" ? access.effectiveDueAt : null,
          expectedSessionId: req.body?.sessionId,
          analyticsContext,
        });
      }
      if (!access.allowed) return sendLevelRestrictionResponse(res, restrictionPayload(access));
      return res.status(409).json({ code: "LEVEL_ALREADY_COMPLETED", message: "This level is already complete." });
    }

    const result = await heartbeatProgressSession(
      levelRow,
      req.body?.sessionId,
      now,
      analyticsContext,
    );
    if (result.completed) {
      return res.status(409).json({
        code: "LEVEL_ALREADY_COMPLETED",
        message: "This level is already complete.",
        activeSeconds: result.activeSeconds,
      });
    }
    if (result.replaced) {
      return res.status(409).json({
        code: "LEVEL_SESSION_REPLACED",
        message: "This level session is active in another tab.",
        activeSeconds: result.activeSeconds,
      });
    }
    return res.json({ ...result, effectiveDueAt: access.effectiveDueAt });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/level/:levelKey/end", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) return res.status(404).json({ message: "Unknown level key" });
    const levelRow = await UserProgress.findOne({ where: { userId: req.userId, levelKey } });
    if (!levelRow) return res.status(404).json({ message: "Progress row not found" });
    if (!req.body?.sessionId || levelRow.activeSessionId !== req.body.sessionId) {
      return res.json({ activeSeconds: levelRow.timeSpentSeconds ?? 0, ended: false });
    }
    const syncAction = readActionId(req.body?.syncId);
    if (syncAction.error) return res.status(400).json({ message: syncAction.error });
    const membership = await findPrimaryActiveMembership(req.userId);
    const access = await getStudentLevelAccess({ userId: req.userId, levelKey, membership });
    const result = await pauseProgressSession(levelRow, {
      stopAt: access.reason === "DEADLINE_PASSED" ? access.effectiveDueAt : null,
      expectedSessionId: req.body.sessionId,
      analyticsContext: {
        studentId: req.userId,
        classroomId: membership?.classroomId ?? null,
        syncId: syncAction.value,
      },
    });
    return res.json({ activeSeconds: result.activeSeconds, ended: result.ended });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/level/:levelKey/attempt", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }

    const actionId = readActionId(req.body?.activityId);
    if (actionId.error) return res.status(400).json({ message: actionId.error });

    await ensureProgressRowsForUser(req.userId);
    const membership = await findPrimaryActiveMembership(req.userId);
    const accessRestriction = await findLevelAccessRestriction(
      req.userId,
      levelKey,
      membership,
    );
    if (accessRestriction) {
      return sendLevelRestrictionResponse(res, accessRestriction);
    }

    const setting = (await getClassroomLevelSettings(membership?.classroomId))
      .find((row) => row.levelKey === levelKey);
    const currentUser = await User.findByPk(req.userId, {
      attributes: ["xpTotal"],
    });
    const validation = await validateLevelCode({
      levelKey,
      sourceCode: req.body?.sourceCode,
      validatorConfig: setting?.validatorConfig ?? null,
    });
    const occurredAt = new Date();
    const dedupeKey = buildEventDedupeKey("failed-attempt", [
      req.userId,
      levelKey,
      actionId.value,
    ]);
    const attemptResult = await UserProgress.sequelize.transaction(async (transaction) => {
      const levelRow = await UserProgress.findOne({
        where: { userId: req.userId, levelKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!levelRow) return null;
      if (levelRow.isCompleted || validation?.isCorrect) {
        return { levelRow, recorded: false, replay: Boolean(levelRow.isCompleted) };
      }

      const recordedEvent = await findRecordedEvent(dedupeKey, { transaction });
      if (recordedEvent) {
        return { levelRow, recorded: false, replay: false };
      }

      levelRow.attemptCount = (levelRow.attemptCount || 0) + 1;
      levelRow.latestFailureCode = validation?.failureCode ?? "UNKNOWN";
      levelRow.latestFailureCategory = validation?.category ?? "unknown";
      levelRow.latestFailureMetadata = validation?.metadata ?? {};
      levelRow.latestFailureAt = occurredAt;
      levelRow.latestFailureAttemptCount = levelRow.attemptCount;
      await levelRow.save({ transaction });
      await recordFailedAttempt({
        studentId: req.userId,
        classroomId: membership?.classroomId ?? null,
        levelKey,
        attemptNumber: levelRow.attemptCount,
        failureCategory: validation?.category ?? "unknown",
        failureCode: validation?.failureCode ?? "UNKNOWN",
        activityId: actionId.value,
        occurredAt,
      }, { transaction });
      return { levelRow, recorded: true, replay: false };
    });
    if (!attemptResult) {
      return res.status(404).json({ message: "Progress row not found" });
    }
    const { levelRow, recorded, replay } = attemptResult;

    return res.json({
      attemptCount: levelRow.attemptCount,
      replay,
      attemptRecorded: recorded,
      validationPassed: Boolean(validation?.isCorrect),
      failureCode: validation?.failureCode ?? null,
      failureCategory: validation?.category ?? null,
      ...buildHintState(levelRow, setting, currentUser?.xpTotal),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/level/:levelKey/hint-feedback", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey) || typeof req.body?.helpful !== "boolean") {
      return res.status(400).json({ message: "A valid level and helpful response are required." });
    }
    const levelRow = await UserProgress.findOne({
      where: { userId: req.userId, levelKey },
    });
    if (!levelRow?.detailedHintUnlocked) {
      return res.status(403).json({ code: "HINT_NOT_OWNED", message: "Unlock the personalized hint before rating it." });
    }
    const stage = getProgressiveHintStage({
      unlocked: true,
      attemptCount: levelRow.attemptCount,
      purchaseAttemptCount: levelRow.detailedHintAttemptCount
        ?? levelRow.attemptCountAtHintUnlock
        ?? levelRow.attemptCount,
    });
    const failureCode = levelRow.latestFailureCode ?? "UNKNOWN";
    const resolvedHint = resolvePersonalizedHint({
      levelKey,
      failureCode,
      category: levelRow.latestFailureCategory ?? "unknown",
      metadata: levelRow.latestFailureMetadata ?? {},
      stage,
    });
    const [feedback] = await HintFeedback.upsert({
      userId: req.userId,
      levelKey,
      failureCode,
      hintStage: stage,
      helpful: req.body.helpful,
      fallbackUsed: Boolean(resolvedHint?.fallbackUsed),
    }, { returning: true });
    return res.json({
      message: "Thanks for rating this hint.",
      helpful: Boolean(feedback?.helpful ?? req.body.helpful),
      failureCode,
      hintStage: stage,
      fallbackUsed: Boolean(resolvedHint?.fallbackUsed),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/level/:levelKey/hint-use", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }
    await ensureProgressRowsForUser(req.userId);
    const membership = await findPrimaryActiveMembership(req.userId);
    const accessRestriction = await findLevelAccessRestriction(req.userId, levelKey, membership);
    if (accessRestriction) return sendLevelRestrictionResponse(res, accessRestriction);

    const levelRow = await UserProgress.findOne({
      where: { userId: req.userId, levelKey },
    });
    if (!levelRow) return res.status(404).json({ message: "Progress row not found" });
    if (levelRow.isCompleted) {
      return res.status(409).json({
        code: "LEVEL_ALREADY_COMPLETED",
        message: "Completed-level replay does not change academic hint history.",
      });
    }

    const setting = (await getClassroomLevelSettings(membership?.classroomId))
      .find((row) => row.levelKey === levelKey);
    const currentUser = await User.findByPk(req.userId, {
      attributes: ["xpTotal"],
    });
    const hintState = buildHintState(levelRow, setting, currentUser?.xpTotal);
    if (!hintState.hintsEnabled) {
      return res.status(403).json({ code: "HINTS_DISABLED", message: "Hints are disabled by your teacher." });
    }
    if (!hintState.hintUnlocked) {
      return res.status(403).json({
        code: "HINT_LOCKED",
        message: `The hint unlocks after ${hintState.hintUnlockThreshold} failed attempts.`,
        ...hintState,
      });
    }

    const persistedLevelRow = await UserProgress.sequelize.transaction(async (transaction) => {
      const lockedRow = await UserProgress.findOne({
        where: { userId: req.userId, levelKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!lockedRow) return null;
      if (lockedRow.isCompleted) return { levelRow: lockedRow, completed: true };
      if (!lockedRow.hintUsed) {
        const occurredAt = new Date();
        lockedRow.hintUsed = true;
        lockedRow.hintUsedAt = occurredAt;
        lockedRow.hintType = "basic";
        lockedRow.attemptCountAtHintUnlock = lockedRow.attemptCount;
        await lockedRow.save({ transaction });
        await recordHintUsed({
          studentId: req.userId,
          classroomId: membership?.classroomId ?? null,
          levelKey,
          hintType: "basic",
          hintPurchased: false,
          occurredAt,
        }, { transaction });
      }
      return { levelRow: lockedRow, completed: false };
    });
    if (!persistedLevelRow) return res.status(404).json({ message: "Progress row not found" });
    if (persistedLevelRow.completed) {
      return res.status(409).json({
        code: "LEVEL_ALREADY_COMPLETED",
        message: "Completed-level replay does not change academic hint history.",
      });
    }
    return res.json({
      message: "Basic hint opened",
      ...buildHintState(persistedLevelRow.levelRow, setting, currentUser?.xpTotal),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/level/:levelKey/detailed-hint-purchase", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey) || !getLevelHints(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }

    await ensureProgressRowsForUser(req.userId);
    const membership = await findPrimaryActiveMembership(req.userId);
    const accessRestriction = await findLevelAccessRestriction(req.userId, levelKey, membership);
    if (accessRestriction) return sendLevelRestrictionResponse(res, accessRestriction);

    const setting = (await getClassroomLevelSettings(membership?.classroomId))
      .find((row) => row.levelKey === levelKey);
    const hintsEnabled = setting?.hintsEnabled !== false;
    const hintUnlockThreshold = Number(setting?.hintUnlockThreshold)
      || DEFAULT_HINT_UNLOCK_THRESHOLD;

    const purchase = await purchaseDetailedHint({
      userId: req.userId,
      classroomId: membership?.classroomId ?? null,
      levelKey,
      hintsEnabled,
      hintUnlockThreshold,
    });
    const hintState = buildHintState(
      purchase.progress,
      setting,
      purchase.totalXp,
    );

    return res.json({
      message: purchase.alreadyUnlocked
        ? "Detailed hint already unlocked"
        : "Detailed hint unlocked",
      purchased: purchase.purchased,
      ...hintState,
    });
  } catch (error) {
    if (error instanceof GamificationError) {
      return res.status(error.status).json({
        code: error.code,
        message: error.message,
        ...error.details,
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/level/:levelKey", async (req, res) => {
  try {
    const body = req.body ?? {};
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }

    const progressInput = parseProgressValue(body.progressPercent);
    if (progressInput.error) {
      return res.status(400).json({ message: progressInput.error });
    }

    if (
      body.isCompleted !== undefined &&
      typeof body.isCompleted !== "boolean"
    ) {
      return res.status(400).json({ message: "isCompleted must be a boolean" });
    }

    await ensureProgressRowsForUser(req.userId);
    const membership = await findPrimaryActiveMembership(req.userId);
    const accessRestriction = await findLevelAccessRestriction(
      req.userId,
      levelKey,
      membership,
    );
    if (accessRestriction) {
      return sendLevelRestrictionResponse(res, accessRestriction);
    }

    const initialLevelRow = await UserProgress.findOne({
      where: {
        userId: req.userId,
        levelKey,
      },
    });

    if (!initialLevelRow) {
      return res.status(404).json({ message: "Progress row not found" });
    }

    const newProgress = progressInput.hasValue
      ? progressInput.value
      : initialLevelRow.progressPercent;
    const completedFromBody = body.isCompleted;
    const requestedCompletion =
      typeof completedFromBody === "boolean"
        ? completedFromBody || newProgress === 100
        : initialLevelRow.isCompleted || newProgress === 100;

    const settings = await getClassroomLevelSettings(membership?.classroomId);
    const setting = settings.find((row) => row.levelKey === levelKey);
    let completionActionId = null;

    let completionAccess = null;
    if (requestedCompletion && !initialLevelRow.isCompleted) {
      const validation = await validateLevelCode({
        levelKey,
        sourceCode: body.sourceCode,
        validatorConfig: setting?.validatorConfig ?? null,
      });
      if (!validation?.isCorrect) {
        return res.status(422).json({
          code: "LEVEL_VALIDATION_FAILED",
          message: validation?.message ?? "The submitted code did not pass server validation.",
          failureCode: validation?.failureCode ?? "UNKNOWN",
          failureCategory: validation?.category ?? "unknown",
          failureMetadata: validation?.metadata ?? {},
        });
      }
      const actionId = readActionId(body.activityId);
      if (actionId.error) return res.status(400).json({ message: actionId.error });
      completionActionId = actionId.value;
      completionAccess = await getStudentLevelAccess({
        userId: req.userId,
        levelKey,
        membership,
        now: new Date(),
      });
      if (!completionAccess.allowed) {
        if (initialLevelRow.activeSessionId) {
          await pauseProgressSession(initialLevelRow, {
            stopAt: completionAccess.reason === "DEADLINE_PASSED"
              ? completionAccess.effectiveDueAt
              : null,
            analyticsContext: {
              studentId: req.userId,
              classroomId: membership?.classroomId ?? null,
              syncId: completionActionId,
            },
          });
        }
        return sendLevelRestrictionResponse(res, restrictionPayload(completionAccess));
      }
    }

    const completionOccurredAt = new Date();
    const mutation = await UserProgress.sequelize.transaction(async (transaction) => {
      const levelRow = await UserProgress.findOne({
        where: { userId: req.userId, levelKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!levelRow) return null;
      if (levelRow.isCompleted) {
        return { levelRow, completedNow: false };
      }

      const progress = progressInput.hasValue
        ? progressInput.value
        : levelRow.progressPercent;
      const isCompleted = typeof completedFromBody === "boolean"
        ? completedFromBody || progress === 100
        : levelRow.isCompleted || progress === 100;
      const completedNow = isCompleted && !levelRow.isCompleted;

      if (completedNow) {
        if (levelRow.activeSessionId) {
          await pauseProgressSession(levelRow, {
            analyticsContext: {
              studentId: req.userId,
              classroomId: membership?.classroomId ?? null,
              syncId: completionActionId,
            },
            transaction,
          });
        }
        const attemptCount = Math.max(0, Number(levelRow.attemptCount) || 0);
        const timeSpentSeconds = Math.max(0, Number(levelRow.timeSpentSeconds) || 0);
        const completedAt = levelRow.completedAt ?? completionOccurredAt;
        const finalScore = computeFinalScore({
          attemptCount,
          timeSpentSeconds,
          parTimeSeconds: getParTimeSeconds(levelRow.orderIndex),
          deadlineAt: completionAccess?.effectiveDueAt ?? setting?.dueAt ?? null,
          completedAt,
          wrongAttemptDeduction: setting?.wrongAttemptDeduction ?? 5,
          lateDeductionPerDay: setting?.lateDeductionPerDay ?? 3,
        });

        levelRow.progressPercent = 100;
        levelRow.isCompleted = true;
        levelRow.completedAt = completedAt;
        levelRow.attemptCount = attemptCount;
        levelRow.timeSpentSeconds = timeSpentSeconds;
        levelRow.finalScore = finalScore;
        await levelRow.save({ transaction });
        await recordLevelCompleted({
          studentId: req.userId,
          classroomId: membership?.classroomId ?? null,
          levelKey,
          attemptNumber: attemptCount + 1,
          score: finalScore,
          activityId: completionActionId,
          occurredAt: completedAt,
        }, { transaction });
      } else {
        levelRow.progressPercent = isCompleted ? 100 : progress;
        levelRow.isCompleted = isCompleted;
        levelRow.completedAt = isCompleted ? levelRow.completedAt ?? completionOccurredAt : null;
        await levelRow.save({ transaction });
      }

      return { levelRow, completedNow };
    });
    if (!mutation) return res.status(404).json({ message: "Progress row not found" });
    const { levelRow, completedNow } = mutation;

    let xpAward = null;
    if (completedNow) {
      xpAward = await awardFirstCompletionXp({
        userId: req.userId,
        levelKey,
        attemptCount: levelRow.attemptCount,
        hintUsed: levelRow.hintUsed,
      });
      if (xpAward.awarded) {
        levelRow.xpAwarded = xpAward.amount;
        levelRow.xpAwardedAt = new Date();
        await levelRow.save();
      }
    }

    const payload = await buildProgressPayloadForUser(req.userId);
    payload.xpAward = xpAward;
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/level/:levelKey/content", async (req, res) => {
  try {
    const levelKey = normalizeLevelKey(req.params.levelKey);
    if (!LEVEL_KEYS.has(levelKey)) {
      return res.status(404).json({ message: "Unknown level key" });
    }

    await ensureProgressRowsForUser(req.userId);
    const accessRestriction = await findLevelAccessRestriction(
      req.userId,
      levelKey,
    );
    if (accessRestriction) {
      return sendLevelRestrictionResponse(res, accessRestriction);
    }

    const primaryMembership = await findPrimaryActiveMembership(req.userId);
    if (!primaryMembership) {
      return res.json({ override: null });
    }

    const levelSettings = await getClassroomLevelSettings(primaryMembership.classroomId);
    const setting = levelSettings.find((row) => row.levelKey === levelKey) ?? null;

    return res.json({ override: setting });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/activity", async (req, res) => {
  try {
    const isPlayingGame = req.body?.isPlayingGame;
    if (typeof isPlayingGame !== "boolean") {
      return res.status(400).json({ message: "isPlayingGame must be a boolean" });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isPlayingGame = isPlayingGame;
    user.lastGameHeartbeatAt = new Date();
    await user.save();

    return res.json({
      message: "Activity updated",
      isPlayingGame: user.isPlayingGame,
      lastGameHeartbeatAt: user.lastGameHeartbeatAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
