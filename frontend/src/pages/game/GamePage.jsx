import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { FiRefreshCw, FiVolume2, FiVolumeX, FiZap, FiZapOff } from "react-icons/fi";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import styles from "./GamePage.module.css";
import Button from "../../Components/Button/Button.jsx";
import Game from "./Game.jsx";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_DIALOGUE_CLOSED,
  GAME_ACCESSIBILITY_CHANGED,
  GAME_LEVEL_RESET,
} from "./gameEvents";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import { buildValidatorFromConfig } from "./levels/buildValidator";
import {
  getLevelConfigByProgressKey,
  getLevelRoute,
} from "./levels/levelConfigs";

const DIALOGUE_TYPING_SPEED_MS = 24;
const AUDIO_PREFERENCE_KEY = "sharprunner:game-audio-muted";
const MOTION_PREFERENCE_KEY = "sharprunner:game-reduced-motion";

const readBooleanPreference = (key, fallback = false) => {
  try {
    const saved = window.localStorage.getItem(key);
    return saved == null ? fallback : saved === "true";
  } catch {
    return fallback;
  }
};

const getDraftKey = (levelConfig) =>
  levelConfig?.progressKey ? `sharprunner:code-draft:${levelConfig.progressKey}` : null;

const getIdleResult = (levelConfig) => ({
  type: "idle",
  message:
    levelConfig?.idleResultMessage ?? "Declare at least one variable, then click Run.",
});

const hasIntroDialogue = (levelConfig) =>
  Boolean(levelConfig?.dialogue?.intro && levelConfig.dialogue.intro.length > 0);

const getDefaultDialogueScript = (levelConfig) => levelConfig?.dialogue?.intro ?? [];

const shouldStartWithDialogue = (levelConfig) => {
  if (!hasIntroDialogue(levelConfig)) {
    return false;
  }

  if (typeof levelConfig?.startWithDialogue === "boolean") {
    return levelConfig.startWithDialogue;
  }

  return true;
};

const isCodeLockedByDialogue = (levelConfig) =>
  Boolean(levelConfig?.lockCodeUntilDialogueDone && hasIntroDialogue(levelConfig));

const getCompletedLevelResult = (progressPayload, levelKey) =>
  progressPayload?.levels?.find((level) => level.levelKey === levelKey) ?? null;

const renderEmphasizedText = (text) =>
  String(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
      }

      return part;
    });

function GamePage({ levelConfig }) {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const nextLevelTimerRef = useRef(null);
  const completionRequestRef = useRef(null);
  const runLevelCheckRef = useRef(null);
  const dialogueButtonRef = useRef(null);
  const hintButtonRef = useRef(null);
  const gradeButtonRef = useRef(null);
  const elapsedSecondsRef = useRef(0);
  const failedAttemptsRef = useRef(0);
  const hintsEnabledRef = useRef(true);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [hintUnlockThreshold, setHintUnlockThreshold] = useState(3);
  const [hintUnlocked, setHintUnlocked] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [dialogueScript, setDialogueScript] = useState(getDefaultDialogueScript(levelConfig));
  const [activeDialogueId, setActiveDialogueId] = useState(null);
  const [showStoryIntro, setShowStoryIntro] = useState(shouldStartWithDialogue(levelConfig));
  const [dialogueStep, setDialogueStep] = useState(0);
  const [typedCharacters, setTypedCharacters] = useState(0);
  const [isCodeLocked, setIsCodeLocked] = useState(isCodeLockedByDialogue(levelConfig));
  const [code, setCode] = useState(levelConfig?.defaultCode ?? "");
  const [result, setResult] = useState(getIdleResult(levelConfig));
  const [mergedLevelConfig, setMergedLevelConfig] = useState(levelConfig);
  const [gradeModal, setGradeModal] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [isMuted, setIsMuted] = useState(() => readBooleanPreference(AUDIO_PREFERENCE_KEY));
  const [reducedMotion, setReducedMotion] = useState(() =>
    readBooleanPreference(
      MOTION_PREFERENCE_KEY,
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    ),
  );

  const clearNextLevelTimer = useCallback(() => {
    if (!nextLevelTimerRef.current) {
      return;
    }

    window.clearTimeout(nextLevelTimerRef.current);
    nextLevelTimerRef.current = null;
  }, []);

  const reportGameActivity = useCallback(async (isPlayingGame) => {
    try {
      await axios.post(
        buildApiUrl("/api/progress/activity"),
        { isPlayingGame },
        { headers: getAuthHeaders() },
      );
    } catch {
      // Activity reporting is best effort and must not interrupt the lesson.
    }
  }, []);

  useEffect(() => {
    clearNextLevelTimer();
    completionRequestRef.current = null;
    setMergedLevelConfig(levelConfig);
    setDialogueScript(getDefaultDialogueScript(levelConfig));
    setActiveDialogueId(null);
    const draftKey = getDraftKey(levelConfig);
    const savedDraft = draftKey ? localStorage.getItem(draftKey) : null;
    setCode(savedDraft ?? levelConfig?.defaultCode ?? "");
    setDraftRestored(Boolean(savedDraft && savedDraft !== levelConfig?.defaultCode));
    setResult(getIdleResult(levelConfig));
    setDialogueStep(0);
    setTypedCharacters(0);
    setShowStoryIntro(shouldStartWithDialogue(levelConfig));
    setIsCodeLocked(isCodeLockedByDialogue(levelConfig));
    setFailedAttempts(0);
    setHintUnlockThreshold(3);
    setHintUnlocked(false);
    setHintUsed(false);
    setShowHint(false);
    hintsEnabledRef.current = true;
    failedAttemptsRef.current = 0;
    setStartedAt(null);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
  }, [clearNextLevelTimer, levelConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(AUDIO_PREFERENCE_KEY, String(isMuted));
      localStorage.setItem(MOTION_PREFERENCE_KEY, String(reducedMotion));
    } catch {
      // Preferences remain usable for this session when storage is unavailable.
    }
    gameEvents.emit(GAME_ACCESSIBILITY_CHANGED, { isMuted, reducedMotion });
  }, [isMuted, reducedMotion, levelConfig?.levelNumber]);

  useEffect(() => {
    if (!levelConfig?.progressKey) return;
    let cancelled = false;
    axios
      .get(
        buildApiUrl(`/api/progress/level/${levelConfig.progressKey}/content`),
        { headers: getAuthHeaders() },
      )
      .then((res) => {
        if (cancelled) return;
        const override = res.data?.override;
        if (!override) return;

        const merged = { ...levelConfig };

        if (override.hintsEnabled === false) {
          merged.hint = null;
          hintsEnabledRef.current = false;
          setShowHint(false);
        } else {
          hintsEnabledRef.current = true;
        }
        const threshold = Number(override.hintUnlockThreshold) || 3;
        setHintUnlockThreshold(threshold);
        setHintUnlocked(
          override.hintsEnabled !== false && failedAttemptsRef.current >= threshold,
        );

        if (override.lessonCardTitle != null) {
          merged.lessonCard = { ...merged.lessonCard, title: override.lessonCardTitle };
        }
        if (override.lessonCardDescription != null) {
          merged.lessonCard = { ...merged.lessonCard, description: override.lessonCardDescription };
        }
        if (override.goalTitle != null) {
          merged.goal = { ...merged.goal, title: override.goalTitle };
        }
        if (override.goalDescription != null) {
          merged.goal = { ...merged.goal, description: override.goalDescription };
        }
        if (Array.isArray(override.instructionItems)) {
          merged.instruction = { ...merged.instruction, items: override.instructionItems };
        }
        if (override.defaultCode != null) {
          merged.defaultCode = override.defaultCode;
          const draftKey = getDraftKey(levelConfig);
          const savedDraft = draftKey ? localStorage.getItem(draftKey) : null;
          if (!savedDraft) setCode(override.defaultCode);
        }
        if (override.validatorConfig != null) {
          merged.validatorConfig = override.validatorConfig;
          const newValidator = buildValidatorFromConfig(override.validatorConfig);
          if (newValidator) merged.validateCode = newValidator;
        }

        setMergedLevelConfig(merged);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [levelConfig]);

  useEffect(() => {
    if (!levelConfig?.progressKey) return;
    const localKey = `sr_startedat_${levelConfig.progressKey}`;
    const sessionKey = `sr_session_${levelConfig.progressKey}`;

    // Restore immediately from whichever cache exists
    const cached = sessionStorage.getItem(sessionKey) || localStorage.getItem(localKey);
    if (cached) setStartedAt(cached);

    let cancelled = false;
    axios
      .post(
        buildApiUrl(`/api/progress/level/${levelConfig.progressKey}/start`),
        {},
        { headers: getAuthHeaders() },
      )
      .then((res) => {
        if (cancelled) return;
        const { startedAt: serverStartedAt, attemptCount, ephemeral } = res.data;

        if (ephemeral) {
          // Completed level — sessionStorage only (resets on tab close/refresh, not on navigation)
          const existing = sessionStorage.getItem(sessionKey);
          if (!existing) {
            sessionStorage.setItem(sessionKey, serverStartedAt);
            setStartedAt(serverStartedAt);
          }
          // else keep the existing session value so navigating away and back doesn't reset
        } else {
          // In-progress level — localStorage so it survives refresh (anti-cheat)
          localStorage.setItem(localKey, serverStartedAt);
          setStartedAt(serverStartedAt);
        }

        const dbAttempts = attemptCount ?? 0;
        failedAttemptsRef.current = dbAttempts;
        setFailedAttempts(dbAttempts);
        setHintUnlockThreshold(res.data.hintUnlockThreshold ?? 3);
        hintsEnabledRef.current = res.data.hintsEnabled !== false;
        setHintUnlocked(Boolean(res.data.hintUnlocked));
        setHintUsed(Boolean(res.data.hintUsed));
      })
      .catch((err) => console.error("Failed to start level timer", err));

    return () => { cancelled = true; };
  }, [levelConfig]);

  useEffect(() => {
    if (!startedAt) return;
    const startMs = new Date(startedAt).getTime();

    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      elapsedSecondsRef.current = secs;
      setElapsedSeconds(secs);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    if (!levelConfig) {
      return undefined;
    }

    const handleDialogueTriggered = (payload = {}) => {
      const {
        levelNumber: dialogueLevelNumber,
        dialogueId = null,
        dialogueSteps = null,
      } = payload;

      if (dialogueLevelNumber !== levelConfig.levelNumber) {
        return;
      }

      const nextDialogueScript =
        Array.isArray(dialogueSteps) && dialogueSteps.length > 0
          ? dialogueSteps
          : getDefaultDialogueScript(levelConfig);

      if (!nextDialogueScript.length) {
        setIsCodeLocked(false);
        return;
      }

      setDialogueScript(nextDialogueScript);
      setActiveDialogueId(dialogueId);
      setDialogueStep(0);
      setTypedCharacters(0);
      setIsCodeLocked(true);
      setShowStoryIntro(true);
    };

    gameEvents.on(GAME_LEVEL_DIALOGUE_TRIGGERED, handleDialogueTriggered);

    return () => {
      gameEvents.off(GAME_LEVEL_DIALOGUE_TRIGGERED, handleDialogueTriggered);
    };
  }, [levelConfig]);

  useEffect(() => {
    if (!levelConfig) {
      return undefined;
    }

    reportGameActivity(true);
    const heartbeatTimer = window.setInterval(() => {
      reportGameActivity(true);
    }, 30_000);

    return () => {
      window.clearInterval(heartbeatTimer);
      reportGameActivity(false);
    };
  }, [levelConfig, reportGameActivity]);

  const markLevelAsCompleted = useCallback(async () => {
    if (!levelConfig?.progressKey) {
      return null;
    }

    if (!completionRequestRef.current) {
      completionRequestRef.current = axios
        .put(
          buildApiUrl(`/api/progress/level/${levelConfig.progressKey}`),
          { progressPercent: 100, isCompleted: true, sourceCode: code ?? "" },
          { headers: getAuthHeaders() },
        )
        .then((response) => response.data)
        .catch((error) => {
          console.error(
            `Failed to save progress for level ${levelConfig.levelNumber}`,
            error,
          );
          completionRequestRef.current = null;
          return null;
        });
    }

    return completionRequestRef.current;
  }, [code, levelConfig]);

  useEffect(() => {
    if (!levelConfig) {
      return undefined;
    }

    const handleOutcome = ({ levelNumber: outcomeLevelNumber, status, message, shouldProceed }) => {
      if (outcomeLevelNumber !== levelConfig.levelNumber) {
        return;
      }

      if (status === "success") {
        setResult({
          type: "success",
          message: message ?? levelConfig.successResultMessage,
        });

        if (shouldProceed) {
          if (levelConfig?.progressKey) {
            localStorage.removeItem(`sr_startedat_${levelConfig.progressKey}`);
            sessionStorage.removeItem(`sr_session_${levelConfig.progressKey}`);
          }
          setStartedAt(null);
          void (async () => {
            const progressPayload = await markLevelAsCompleted();
            if (!progressPayload) {
              setResult({
                type: "error",
                message:
                  "Level cleared, but progress could not be saved. Stay on this page and try again.",
              });
              return;
            }

            const completedLevel = getCompletedLevelResult(
              progressPayload,
              levelConfig.progressKey,
            );
            const savedScore = Number(completedLevel?.finalScore);

            if (!completedLevel || !Number.isFinite(savedScore)) {
              setResult({
                type: "error",
                message:
                  "Level cleared, but the saved grade could not be loaded. Refresh the page to confirm progress.",
              });
              return;
            }

            const draftKey = getDraftKey(levelConfig);
            if (draftKey) localStorage.removeItem(draftKey);

            setGradeModal({
              score: savedScore,
              grade: completedLevel?.grade ?? "B",
              attempts: completedLevel?.attemptCount ?? failedAttemptsRef.current,
              timeSeconds: completedLevel?.timeSpentSeconds ?? elapsedSecondsRef.current,
              isFinalLevel: levelConfig.levelNumber === 30,
              nextLevelKey:
                progressPayload.summary?.currentLevelKey === levelConfig.progressKey
                  ? null
                  : progressPayload.summary?.currentLevelKey ?? null,
              xpEarned: progressPayload.xpAward?.amount ?? 0,
              totalXp: progressPayload.xpAward?.totalXp ?? progressPayload.summary?.xp ?? 0,
              xpBreakdown: progressPayload.xpAward?.breakdown ?? [],
            });
          })();
        }

        return;
      }

      if (levelConfig?.progressKey) {
        axios
          .post(
            buildApiUrl(`/api/progress/level/${levelConfig.progressKey}/attempt`),
            {},
            { headers: getAuthHeaders() },
          )
          .then((res) => {
            failedAttemptsRef.current = res.data.attemptCount;
            setFailedAttempts(res.data.attemptCount);
            setHintUnlockThreshold(res.data.hintUnlockThreshold ?? 3);
            setHintUnlocked(Boolean(res.data.hintUnlocked));
            setHintUsed(Boolean(res.data.hintUsed));
          })
          .catch(() => {});
      }

      setResult({
        type: "error",
        message: message ?? levelConfig.errorResultMessage,
      });
    };

    gameEvents.on(GAME_LEVEL_OUTCOME, handleOutcome);

    return () => {
      gameEvents.off(GAME_LEVEL_OUTCOME, handleOutcome);
      clearNextLevelTimer();
    };
  }, [clearNextLevelTimer, levelConfig, markLevelAsCompleted, mergedLevelConfig]);

  const resultClassName = useMemo(() => {
    if (result.type === "success") {
      return `${styles.resultBanner} ${styles.resultSuccess}`;
    }

    if (result.type === "error") {
      return `${styles.resultBanner} ${styles.resultError}`;
    }

    return styles.resultBanner;
  }, [result.type]);

  const runLevelCheck = () => {
    if (isCodeLocked) {
      setResult({
        type: "error",
        message: "Reach the NPC and finish the dialogue first.",
      });
      return;
    }

    if (!mergedLevelConfig?.validateCode) {
      setResult({
        type: "error",
        message: "Level validator is not configured.",
      });
      return;
    }

    clearNextLevelTimer();

    const sourceCode = code ?? "";
    const validation = mergedLevelConfig.validateCode(sourceCode);

    gameEvents.emit(GAME_LEVEL_CODE_EVALUATED, {
      levelNumber: mergedLevelConfig.levelNumber,
      isCorrect: validation.isCorrect,
      message: validation.message,
      sourceCode,
      configuredVariableName:
        mergedLevelConfig.validatorConfig?.variableName ??
        mergedLevelConfig.validatorConfig?.goals?.[0]?.name ??
        null,
      ...(validation.payload ?? {}),
    });

    setResult({
      type: validation.isCorrect ? "success" : "error",
      message: validation.message,
    });
  };
  runLevelCheckRef.current = runLevelCheck;

  const handleEditorMount = useCallback((editor, monaco) => {
    editor.addAction({
      id: "sharprunner-run-code",
      label: "Run level code",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => runLevelCheckRef.current?.(),
    });
  }, []);

  const exitButton = () => {
    navigate("/dashboard");
  };

  const openBasicHint = async () => {
    if (!mergedLevelConfig?.hint || !hintUnlocked || !hintsEnabledRef.current) return;
    try {
      const response = await axios.post(
        buildApiUrl(`/api/progress/level/${levelConfig.progressKey}/hint-use`),
        {},
        { headers: getAuthHeaders() },
      );
      setHintUsed(Boolean(response.data?.hintUsed));
      setShowHint(true);
    } catch (error) {
      setResult({
        type: "error",
        message: error.response?.data?.message ?? "The hint could not be opened.",
      });
    }
  };

  const resetCode = () => {
    const defaultCode = mergedLevelConfig?.defaultCode ?? levelConfig?.defaultCode ?? "";
    if (
      levelConfig?.levelNumber === 30 &&
      code !== defaultCode &&
      !window.confirm("Reset the final compile? Your current draft will be replaced.")
    ) {
      return;
    }
    const draftKey = getDraftKey(levelConfig);
    if (draftKey) localStorage.removeItem(draftKey);
    setCode(defaultCode);
    setDraftRestored(false);
    setResult(getIdleResult(mergedLevelConfig));
    gameEvents.emit(GAME_LEVEL_RESET, { levelNumber: levelConfig?.levelNumber });
  };

  const updateCode = (nextValue) => {
    const nextCode = nextValue ?? "";
    setCode(nextCode);
    const draftKey = getDraftKey(levelConfig);
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, nextCode);
    } catch {
      // Draft recovery is optional when storage is unavailable.
    }
  };

  const activeDialogue = dialogueScript[dialogueStep];
  const isLastDialogue = dialogueScript.length > 0
    ? dialogueStep === dialogueScript.length - 1
    : true;

  const totalStepCharacters = useMemo(() => {
    if (!activeDialogue) {
      return 0;
    }

    return activeDialogue.lines.reduce((sum, line) => sum + line.text.length, 0);
  }, [activeDialogue]);

  const isTyping = Boolean(activeDialogue) && typedCharacters < totalStepCharacters;

  const displayedLines = useMemo(() => {
    if (!activeDialogue) {
      return [];
    }

    let remaining = typedCharacters;

    return activeDialogue.lines.map((line) => {
      if (remaining <= 0) {
        return { ...line, visibleText: "" };
      }

      const visibleText = line.text.slice(0, remaining);
      remaining -= line.text.length;
      return { ...line, visibleText };
    });
  }, [activeDialogue, typedCharacters]);

  useEffect(() => {
    setTypedCharacters(0);
  }, [dialogueStep, levelConfig?.levelNumber]);

  useEffect(() => {
    if (showHint) hintButtonRef.current?.focus();
  }, [showHint]);

  useEffect(() => {
    if (!showStoryIntro || !activeDialogue) return undefined;
    const focusTimer = window.setTimeout(() => dialogueButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [showStoryIntro, activeDialogue, activeDialogueId, dialogueStep]);

  useEffect(() => {
    if (gradeModal) gradeButtonRef.current?.focus();
  }, [gradeModal]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape" && showHint) setShowHint(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showHint]);

  useEffect(() => {
    if (!showStoryIntro || !activeDialogue) {
      return undefined;
    }

    if (typedCharacters >= totalStepCharacters) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setTypedCharacters((current) => Math.min(current + 1, totalStepCharacters));
    }, DIALOGUE_TYPING_SPEED_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showStoryIntro, activeDialogue, typedCharacters, totalStepCharacters]);

  const nextDialogue = () => {
    if (!activeDialogue) {
      setShowStoryIntro(false);
      return;
    }

    if (isTyping) {
      setTypedCharacters(totalStepCharacters);
      return;
    }

    if (isLastDialogue) {
      setShowStoryIntro(false);
      setIsCodeLocked(false);
      if (levelConfig) {
        gameEvents.emit(GAME_LEVEL_DIALOGUE_CLOSED, {
          levelNumber: levelConfig.levelNumber,
          dialogueId: activeDialogueId,
        });
      }
      setActiveDialogueId(null);
      return;
    }

    setDialogueStep((current) => current + 1);
  };

  const parTimeSeconds = levelConfig?.parTimeSeconds ?? 900;
  const isOvertime = elapsedSeconds > parTimeSeconds;
  const timerMinutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const timerSecondsDisplay = (elapsedSeconds % 60).toString().padStart(2, "0");
  const timerLabel = `${timerMinutes}:${timerSecondsDisplay}`;

  if (isMobile) {
    return (
      <div className={styles.mobileBlock}>
        <div className={styles.mobileBlockInner}>
          <div className={styles.mobileBlockIcon}>🎮</div>
          <h2 className={styles.mobileBlockTitle}>Desktop Required</h2>
          <p className={styles.mobileBlockText}>
            The coding game requires a larger screen to play. Please open SharpRunner on a desktop or laptop.
          </p>
          <button className={styles.mobileBlockBtn} onClick={() => navigate("/dashboard")}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!levelConfig) {
    return (
      <div className={styles.gameContainer}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h1>Unknown level</h1>
            <span>This level is not configured yet.</span>
          </div>
          <Button
            label="Back to Map"
            variant="outline"
            size="sm"
            onClick={() => navigate("/Map")}
          />
        </header>
      </div>
    );
  }

  const uiAssetBase =
    levelConfig.dialogue?.assetBase ?? `${import.meta.env.BASE_URL}game/assets/ui/dialogue`;
  const portraitImage =
    activeDialogue?.portraitImage ??
    levelConfig.dialogue?.portraitImage ??
    "portrait_player_main.png";
  const portraitAlt =
    activeDialogue?.portraitAlt ??
    levelConfig.dialogue?.portraitAlt ??
    "Character portrait";
  const goalTitle = mergedLevelConfig?.goal?.title ?? "Goal";
  const goalDescription =
    mergedLevelConfig?.goal?.description ?? "Complete this level's coding objective.";
  const instructionTitle = mergedLevelConfig?.instruction?.title ?? "Instruction";
  const instructionItems = mergedLevelConfig?.instruction?.items ?? [];
  const lessonCardTitle = mergedLevelConfig?.lessonCard?.title ?? "Lesson";
  const lessonCardDescription = mergedLevelConfig?.lessonCard?.description ?? "";
  const lessonCardSections = mergedLevelConfig?.lessonCard?.sections ?? [];
  const chapterLabel =
    levelConfig.chapterLabel ?? `Chapter ${levelConfig.levelNumber}`;

  return (
    <div className={styles.gameContainer}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>{levelConfig.title}</h1>
          <span>{levelConfig.subtitle}</span>
        </div>
        <div className={isOvertime ? styles.timerOvertime : styles.timer}>
          <span className={styles.timerLabel}>Time</span>
          <span className={styles.timerValue}>{timerLabel}</span>
        </div>
        <Button label="Exit" variant="outline" size="sm" onClick={exitButton} />
      </header>

      <main className={styles.mainLayout}>
        <div className={styles.upperRow}>
          <div id="phaser-canvas-root" className={styles.phaserCanvasRoot}>
            <Game
              scene={levelConfig.scene}
              sceneKey={levelConfig.sceneKey ?? `level-${levelConfig.levelNumber}`}
              isMuted={isMuted}
            />
            {showHint && mergedLevelConfig?.hint && (
              <div className={styles.hintOverlay} role="presentation">
                <div className={styles.hintBox} role="dialog" aria-modal="true" aria-labelledby="level-hint-title">
                  <div className={styles.hintHeader}>
                    <span id="level-hint-title" className={styles.hintTitle}>Hint</span>
                    <button ref={hintButtonRef} type="button" className={styles.hintClose} onClick={() => setShowHint(false)} aria-label="Close hint">✕</button>
                  </div>
                  <p className={styles.hintText}>{mergedLevelConfig.hint}</p>
                  <button type="button" className={styles.hintDismiss} onClick={() => setShowHint(false)}>Got it</button>
                </div>
              </div>
            )}
            {showStoryIntro && activeDialogue && (
              <div className={styles.storyOverlay} role="presentation">
                <div className={styles.storyContainer} role="dialog" aria-modal="true" aria-label={`${activeDialogue.speaker} dialogue`}>
                  <div className={styles.storyChapter}>{chapterLabel}</div>

                  <div className={styles.dialogueBox}>
                    <img
                      src={`${uiAssetBase}/dialogue_box.png`}
                      alt=""
                      className={styles.dialogueBoxSkin}
                    />

                    <div className={styles.portraitContainer}>
                      <img
                        src={`${uiAssetBase}/portrait_frame.png`}
                        alt=""
                        className={styles.portraitFrame}
                      />
                      <img
                        src={`${uiAssetBase}/${portraitImage}`}
                        alt={portraitAlt}
                        className={styles.portraitFace}
                      />
                    </div>

                    <div className={styles.nameTag}>
                      <img
                        src={`${uiAssetBase}/name_box.png`}
                        alt=""
                        className={styles.nameTagSkin}
                      />
                      <span>{activeDialogue.speaker}</span>
                    </div>

                    <div className={styles.dialogueTextBlock}>
                      {displayedLines.map((line) => (
                        <p
                          key={line.text}
                          className={`${styles.dialogueLine} ${
                            line.tone === "accent"
                              ? styles.dialogueAccent
                              : line.tone === "goal"
                                ? styles.dialogueGoal
                                : ""
                          }`}
                        >
                          {line.visibleText}
                        </p>
                      ))}
                      {isTyping && <span className={styles.typingCaret}>_</span>}
                    </div>

                    <div className={styles.storyAction}>
                      <img
                        src={`${uiAssetBase}/dialogue_finished_icon.png`}
                        alt=""
                        className={styles.dialogueCursor}
                      />
                    </div>

                    <div className={styles.dialogueButtonWrap}>
                      <Button
                        ref={dialogueButtonRef}
                        label={
                          isTyping
                            ? "Skip"
                            : isLastDialogue
                              ? activeDialogueId
                                ? "Continue"
                                : "Start Level"
                              : "Next"
                        }
                        variant="primary"
                        size="sm"
                        onClick={nextDialogue}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.editorPanel}>
            <div className={styles.editorHeader}>
              <div className={styles.editorTitleGroup}>
                <b>C#</b>
                {draftRestored && <span className={styles.draftStatus}>Draft restored</span>}
              </div>
              <div className={styles.editorActions}>
                <button type="button" className={styles.iconButton} onClick={resetCode} title="Reset code" aria-label="Reset code">
                  <FiRefreshCw aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${isMuted ? styles.iconButtonActive : ""}`}
                  onClick={() => setIsMuted((current) => !current)}
                  title={isMuted ? "Turn sound on" : "Mute sound"}
                  aria-label={isMuted ? "Turn sound on" : "Mute sound"}
                  aria-pressed={isMuted}
                >
                  {isMuted ? <FiVolumeX aria-hidden="true" /> : <FiVolume2 aria-hidden="true" />}
                </button>
                {levelConfig.levelNumber === 30 && (
                  <button
                    type="button"
                    className={`${styles.iconButton} ${reducedMotion ? styles.iconButtonActive : ""}`}
                    onClick={() => setReducedMotion((current) => !current)}
                    title={reducedMotion ? "Use full motion" : "Reduce motion"}
                    aria-label={reducedMotion ? "Use full motion" : "Reduce motion"}
                    aria-pressed={reducedMotion}
                  >
                    {reducedMotion ? <FiZapOff aria-hidden="true" /> : <FiZap aria-hidden="true" />}
                  </button>
                )}
                <Button label="Submit" variant="primary" size="sm" onClick={runLevelCheck} />
              </div>
            </div>
            <div style={{ flexGrow: 1 }}>
              <Editor
                height="100%"
                theme="light"
                defaultLanguage="csharp"
                value={code}
                onChange={updateCode}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  readOnly: isCodeLocked,
                }}
              />
            </div>
            <div className={styles.editorFooter}>
              <Button
                label="Run"
                variant="outline"
                size="sm"
                onClick={runLevelCheck}
              />
              {mergedLevelConfig?.hint && hintsEnabledRef.current ? (
                <div className={styles.hintAccess} aria-live="polite">
                  {hintUnlocked ? (
                    <button type="button" className={styles.hintAccessButton} onClick={openBasicHint}>
                      {hintUsed ? "Review free hint" : "Hint unlocked · Free"}
                    </button>
                  ) : (
                    <span>
                      {failedAttempts === 0
                        ? `Hint available after ${hintUnlockThreshold} failed attempts.`
                        : `${Math.max(0, hintUnlockThreshold - failedAttempts)} attempt${Math.max(0, hintUnlockThreshold - failedAttempts) === 1 ? "" : "s"} remaining before hint unlocks.`}
                    </span>
                  )}
                </div>
              ) : (
                <span className={styles.hintDisabled}>Hints are disabled for this classroom.</span>
              )}
            </div>
            <div className={resultClassName} role="status" aria-live="polite">{result.message}</div>
          </div>
        </div>

        <div className={styles.lowerRow}>
          <section className={styles.card}>
            <h3>{goalTitle}</h3>
            <p>{goalDescription}</p>
            <h3>{instructionTitle}</h3>
            <ul>
              {instructionItems.map((item) => (
                <li key={item}>{renderEmphasizedText(item)}</li>
              ))}
            </ul>
          </section>

          <section className={styles.card}>
            <h3>{lessonCardTitle}</h3>
            {lessonCardDescription && <p>{lessonCardDescription}</p>}
            {lessonCardSections.map((section) => (
              <div className={styles.lessonSection} key={section.title}>
                {section.title && <h4>{section.title}</h4>}
                {section.body && <p>{section.body}</p>}
                {section.code && (
                  <pre className={styles.lessonCode}>
                    <code>{section.code}</code>
                  </pre>
                )}
                {Array.isArray(section.items) && section.items.length > 0 && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </div>
      </main>

      {gradeModal && (
        <div className={styles.gradeOverlay} role="presentation">
          <div className={`${styles.gradeCard} ${styles[`gradeCard${gradeModal.grade}`]}`} role="dialog" aria-modal="true" aria-labelledby="completion-title">
            <div id="completion-title" className={styles.gradeComplete}>
              <span className={styles.gradeCompleteLine} />
              {gradeModal.isFinalLevel ? "JOURNEY COMPLETE" : "LEVEL COMPLETE"}
              <span className={styles.gradeCompleteLine} />
            </div>

            {gradeModal.isFinalLevel && (
              <div className={styles.finalCompletionCopy}>
                <strong>Dawn of the Last Compile</strong>
                <span>You restored the moon and completed SharpRunner's coding journey.</span>
                <div className={styles.finalSkillRecap} aria-label="Skills used in the final compile">
                  {[
                    "Arrays",
                    "Loops",
                    "Methods",
                    "Parameters",
                    "Return values",
                    "2D arrays",
                    "Recursion",
                  ].map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.gradeBadgeWrap}>
              <div className={styles.gradeRays} />
              <div className={`${styles.gradeBadge} ${styles[`grade${gradeModal.grade}`]}`}>
                {gradeModal.grade}
              </div>
              <span className={`${styles.gradeSpark} ${styles.gradeSparkA}`} />
              <span className={`${styles.gradeSpark} ${styles.gradeSparkB}`} />
              <span className={`${styles.gradeSpark} ${styles.gradeSparkC}`} />
              <span className={`${styles.gradeSpark} ${styles.gradeSparkD}`} />
            </div>

            <div className={styles.gradeScoreRow}>
              <div className={styles.gradeScore}>{gradeModal.score}</div>
              <div className={styles.gradeScoreLabel}>/ 100</div>
            </div>

            <div className={styles.gradeXp}>
              &#10022; +{gradeModal.xpEarned} XP earned · {gradeModal.totalXp} total XP
            </div>
            {gradeModal.xpBreakdown?.length > 0 && (
              <div className={styles.gradeXpBreakdown}>
                {gradeModal.xpBreakdown.map((item) => (
                  <span key={item.key}>+{item.amount} {item.label}</span>
                ))}
              </div>
            )}

            <div className={styles.gradeStats}>
              <div className={styles.gradeStat}>
                <span className={styles.gradeStatValue}>
                  {Math.floor(gradeModal.timeSeconds / 60)}m {gradeModal.timeSeconds % 60}s
                </span>
                <span className={styles.gradeStatLabel}>Time</span>
              </div>
              <div className={styles.gradeStatDivider} />
              <div className={styles.gradeStat}>
                <span className={styles.gradeStatValue}>{gradeModal.attempts}</span>
                <span className={styles.gradeStatLabel}>Mistakes</span>
              </div>
            </div>

            <button
              ref={gradeButtonRef}
              className={`${styles.gradeContinueBtn} ${styles[`gradeContinueBtn${gradeModal.grade}`]}`}
              onClick={() => {
                setGradeModal(null);
                const nextConfig = getLevelConfigByProgressKey(gradeModal.nextLevelKey);
                navigate(
                  nextConfig ? getLevelRoute(nextConfig.levelNumber) : "/Map",
                );
              }}
            >
              {gradeModal.isFinalLevel ? "Return to Map" : "Continue"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GamePage;
