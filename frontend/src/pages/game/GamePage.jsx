import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./GamePage.module.css";
import Button from "../../Components/Button/Button.jsx";
import Game from "./Game.jsx";
import {
  gameEvents,
  GAME_LEVEL_CODE_EVALUATED,
  GAME_LEVEL_OUTCOME,
  GAME_LEVEL_DIALOGUE_TRIGGERED,
  GAME_LEVEL_DIALOGUE_CLOSED,
} from "./gameEvents";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import { getLevelConfig } from "./levels/levelConfigs";
import { buildValidatorFromConfig } from "./levels/buildValidator";

const DIALOGUE_TYPING_SPEED_MS = 24;

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

function GamePage() {
  const navigate = useNavigate();
  const { levelNumber } = useParams();
  const parsedLevelNumber = Number(levelNumber);

  const levelConfig = useMemo(
    () => getLevelConfig(parsedLevelNumber),
    [parsedLevelNumber],
  );

  const nextLevelTimerRef = useRef(null);
  const completionRequestRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const elapsedSecondsRef = useRef(0);
  const failedAttemptsRef = useRef(0);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
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
    } catch {}
  }, []);

  useEffect(() => {
    clearNextLevelTimer();
    completionRequestRef.current = null;
    setMergedLevelConfig(levelConfig);
    setDialogueScript(getDefaultDialogueScript(levelConfig));
    setActiveDialogueId(null);
    setCode(levelConfig?.defaultCode ?? "");
    setResult(getIdleResult(levelConfig));
    setDialogueStep(0);
    setTypedCharacters(0);
    setShowStoryIntro(shouldStartWithDialogue(levelConfig));
    setIsCodeLocked(isCodeLockedByDialogue(levelConfig));
    setFailedAttempts(0);
    setShowHint(false);
    failedAttemptsRef.current = 0;
    setStartedAt(null);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
  }, [clearNextLevelTimer, levelConfig]);

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
          setCode(override.defaultCode);
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
        if (dbAttempts >= 3 && levelConfig?.hint) setShowHint(true);
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
      return false;
    }

    if (!completionRequestRef.current) {
      completionRequestRef.current = axios
        .put(
          buildApiUrl(`/api/progress/level/${levelConfig.progressKey}`),
          { progressPercent: 100, isCompleted: true },
          { headers: getAuthHeaders() },
        )
        .then(() => true)
        .catch((error) => {
          console.error(
            `Failed to save progress for level ${levelConfig.levelNumber}`,
            error,
          );
          completionRequestRef.current = null;
          return false;
        });
    }

    return completionRequestRef.current;
  }, [levelConfig]);

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
            const didSaveProgress = await markLevelAsCompleted();
            if (!didSaveProgress) {
              setResult({
                type: "error",
                message:
                  "Level cleared, but progress could not be saved. Stay on this page and try again.",
              });
              return;
            }

            clearNextLevelTimer();
            nextLevelTimerRef.current = window.setTimeout(() => {
              navigate(levelConfig.nextRoute ?? "/Map");
            }, levelConfig.nextDelayMs ?? 1200);
          })();
        }

        return;
      }

      const nextCount = failedAttemptsRef.current + 1;
      failedAttemptsRef.current = nextCount;
      setFailedAttempts(nextCount);
      if (nextCount === 3 && levelConfig?.hint) setShowHint(true);

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
            if (res.data.attemptCount >= 3 && levelConfig?.hint) setShowHint(true);
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
  }, [clearNextLevelTimer, levelConfig, markLevelAsCompleted, navigate]);

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

  const exitButton = () => {
    navigate("/dashboard");
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
            />
            {showHint && levelConfig.hint && (
              <div className={styles.hintOverlay}>
                <div className={styles.hintBox}>
                  <div className={styles.hintHeader}>
                    <span className={styles.hintTitle}>Hint</span>
                    <button className={styles.hintClose} onClick={() => setShowHint(false)}>✕</button>
                  </div>
                  <p className={styles.hintText}>{levelConfig.hint}</p>
                  <button className={styles.hintDismiss} onClick={() => setShowHint(false)}>Got it</button>
                </div>
              </div>
            )}
            {showStoryIntro && activeDialogue && (
              <div className={styles.storyOverlay}>
                <div className={styles.storyContainer}>
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
                        label={
                          isTyping
                            ? "Skip"
                            : isLastDialogue
                              ? "Start Level"
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
              <span>
                <b>C#</b>
              </span>
              <Button
                label="Submit"
                variant="primary"
                size="sm"
                onClick={runLevelCheck}
              />
            </div>
            <div style={{ flexGrow: 1 }}>
              <Editor
                height="100%"
                theme="light"
                defaultLanguage="csharp"
                value={code}
                onChange={(val) => setCode(val ?? "")}
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
            </div>
            <div className={resultClassName}>{result.message}</div>
          </div>
        </div>

        <div className={styles.lowerRow}>
          <section className={styles.card}>
            <h3>{goalTitle}</h3>
            <p>{goalDescription}</p>
            <h3>{instructionTitle}</h3>
            <ul>
              {instructionItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={styles.card}>
            <h3>{lessonCardTitle}</h3>
            <p>{lessonCardDescription}</p>
          </section>
        </div>
      </main>
    </div>
  );
}

export default GamePage;
