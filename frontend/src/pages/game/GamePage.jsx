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
} from "./gameEvents";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import { getLevelConfig } from "./levels/levelConfigs";

const DIALOGUE_TYPING_SPEED_MS = 24;

const getIdleResult = (levelConfig) => ({
  type: "idle",
  message:
    levelConfig?.idleResultMessage ?? "Declare at least one variable, then click Run.",
});

const hasIntroDialogue = (levelConfig) =>
  Boolean(levelConfig?.dialogue?.intro && levelConfig.dialogue.intro.length > 0);

function GamePage() {
  const navigate = useNavigate();
  const { levelNumber } = useParams();
  const parsedLevelNumber = Number(levelNumber);

  const levelConfig = useMemo(
    () => getLevelConfig(parsedLevelNumber),
    [parsedLevelNumber],
  );

  const nextLevelTimerRef = useRef(null);
  const [showStoryIntro, setShowStoryIntro] = useState(hasIntroDialogue(levelConfig));
  const [dialogueStep, setDialogueStep] = useState(0);
  const [typedCharacters, setTypedCharacters] = useState(0);
  const [code, setCode] = useState(levelConfig?.defaultCode ?? "");
  const [result, setResult] = useState(getIdleResult(levelConfig));

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
    setCode(levelConfig?.defaultCode ?? "");
    setResult(getIdleResult(levelConfig));
    setDialogueStep(0);
    setTypedCharacters(0);
    setShowStoryIntro(hasIntroDialogue(levelConfig));
  }, [clearNextLevelTimer, levelConfig]);

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
      return;
    }

    try {
      await axios.put(
        buildApiUrl(`/api/progress/level/${levelConfig.progressKey}`),
        {
          progressPercent: 100,
          isCompleted: true,
        },
        {
          headers: getAuthHeaders(),
        },
      );
    } catch (error) {
      console.error(`Failed to save progress for level ${levelConfig.levelNumber}`, error);
    }
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
          markLevelAsCompleted();
          clearNextLevelTimer();

          nextLevelTimerRef.current = window.setTimeout(() => {
            navigate(levelConfig.nextRoute ?? "/Map");
          }, levelConfig.nextDelayMs ?? 1200);
        }

        return;
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
    if (!levelConfig?.validateCode) {
      setResult({
        type: "error",
        message: "Level validator is not configured.",
      });
      return;
    }

    clearNextLevelTimer();

    const sourceCode = code ?? "";
    const validation = levelConfig.validateCode(sourceCode);

    gameEvents.emit(GAME_LEVEL_CODE_EVALUATED, {
      levelNumber: levelConfig.levelNumber,
      isCorrect: validation.isCorrect,
      sourceCode,
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

  const storyIntro = levelConfig?.dialogue?.intro ?? [];
  const activeDialogue = storyIntro[dialogueStep];
  const isLastDialogue = storyIntro.length > 0
    ? dialogueStep === storyIntro.length - 1
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
      return;
    }

    setDialogueStep((current) => current + 1);
  };

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
  const portraitImage = levelConfig.dialogue?.portraitImage ?? "portrait_player_main.png";
  const portraitAlt = levelConfig.dialogue?.portraitAlt ?? "Character portrait";
  const goalTitle = levelConfig.goal?.title ?? "Goal";
  const goalDescription =
    levelConfig.goal?.description ?? "Complete this level's coding objective.";
  const instructionTitle = levelConfig.instruction?.title ?? "Instruction";
  const instructionItems = levelConfig.instruction?.items ?? [];
  const lessonCardTitle = levelConfig.lessonCard?.title ?? "Lesson";
  const lessonCardDescription = levelConfig.lessonCard?.description ?? "";
  const chapterLabel =
    levelConfig.chapterLabel ?? `Chapter ${levelConfig.levelNumber}`;

  return (
    <div className={styles.gameContainer}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>{levelConfig.title}</h1>
          <span>{levelConfig.subtitle}</span>
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
                options={{ minimap: { enabled: false }, fontSize: 14 }}
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
