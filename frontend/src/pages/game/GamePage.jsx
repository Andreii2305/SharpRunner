import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import styles from "./GamePage.module.css";
import Button from "../../Components/Button/Button.jsx";
import { useNavigate } from "react-router-dom";
import Game from "./Game.jsx";
import {
  gameEvents,
  LEVEL_ONE_CODE_EVALUATED,
  LEVEL_ONE_OUTCOME,
} from "./gameEvents";

const DIALOGUE_TYPING_SPEED_MS = 24;
const NEXT_LEVEL_ROUTE = "/lesson";
const NEXT_LEVEL_DELAY_MS = 1200;

const LEVEL_ONE_GOAL_DECLARATIONS = [
  {
    name: "heroName",
    allowedTypes: new Set(["string"]),
    requiredValue: '"Kai"',
  },
  {
    name: "action",
    allowedTypes: new Set(["string"]),
    requiredValue: '"walk"',
  },
];

const LEVEL_ONE_GOAL_BY_NAME = new Map(
  LEVEL_ONE_GOAL_DECLARATIONS.map((goal) => [goal.name, goal]),
);

const DECLARATION_REGEX =
  /\b(int|double|float|decimal|bool|string|String|char|long|short|byte|var)\s+([A-Za-z_]\w*)\s*(?:=\s*([^;]+))?\s*;/g;

const COMMENT_REGEX = /\/\/.*$|\/\*[\s\S]*?\*\//gm;

const stripComments = (sourceCode) => sourceCode.replace(COMMENT_REGEX, "");

const validateLevelOneCode = (sourceCode) => {
  const codeWithoutComments = stripComments(sourceCode);
  const declarations = [...codeWithoutComments.matchAll(DECLARATION_REGEX)];
  const matchedGoals = new Set();

  for (const declaration of declarations) {
    const [, type, variableName, assignmentValue] = declaration;
    const goal = LEVEL_ONE_GOAL_BY_NAME.get(variableName);

    if (!goal) {
      return {
        isCorrect: false,
        message: `Unexpected variable "${variableName}". Only heroName and action are allowed in Level 1.`,
      };
    }

    if (matchedGoals.has(variableName)) {
      return {
        isCorrect: false,
        message: `Variable "${variableName}" is declared more than once.`,
      };
    }

    if (!goal.allowedTypes.has(type)) {
      return {
        isCorrect: false,
        message: `"${variableName}" must use type string.`,
      };
    }

    if (!assignmentValue || assignmentValue.trim() === "") {
      return {
        isCorrect: false,
        message: `"${variableName}" must be initialized with ${goal.requiredValue}.`,
      };
    }

    if (assignmentValue.trim() !== goal.requiredValue) {
      return {
        isCorrect: false,
        message: `"${variableName}" must be exactly ${goal.requiredValue}.`,
      };
    }

    matchedGoals.add(variableName);
  }

  for (const goal of LEVEL_ONE_GOAL_DECLARATIONS) {
    if (!matchedGoals.has(goal.name)) {
      return {
        isCorrect: false,
        message: `Missing goal declaration: string ${goal.name} = ${goal.requiredValue};`,
      };
    }
  }

  if (declarations.length !== LEVEL_ONE_GOAL_DECLARATIONS.length) {
    return {
      isCorrect: false,
      message: "Only the exact goal declarations are accepted for this level.",
    };
  }

  return {
    isCorrect: true,
    message: "Exact goal declarations found. Character is moving to the gate.",
  };
};

const LevelOne = () => {
  const navigate = useNavigate();
  const nextLevelTimerRef = useRef(null);
  const [showStoryIntro, setShowStoryIntro] = useState(true);
  const [dialogueStep, setDialogueStep] = useState(0);

  const [code, setCode] = useState(
    "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare Variable Here\n\n    }\n  }\n}",
  );
  const [typedCharacters, setTypedCharacters] = useState(0);
  const [result, setResult] = useState({
    type: "idle",
    message: "Declare at least one variable, then click Run.",
  });

  useEffect(() => {
    const handleOutcome = ({ status, message, shouldProceed }) => {
      if (status === "success") {
        setResult({
          type: "success",
          message:
            message ?? "Great job. Gate opened and level objective completed.",
        });

        if (shouldProceed) {
          if (nextLevelTimerRef.current) {
            window.clearTimeout(nextLevelTimerRef.current);
          }

          nextLevelTimerRef.current = window.setTimeout(() => {
            navigate(NEXT_LEVEL_ROUTE);
          }, NEXT_LEVEL_DELAY_MS);
        }

        return;
      }

      setResult({
        type: "error",
        message:
          message ??
          "You failed. Add a valid C# variable declaration and retry.",
      });
    };

    gameEvents.on(LEVEL_ONE_OUTCOME, handleOutcome);

    return () => {
      gameEvents.off(LEVEL_ONE_OUTCOME, handleOutcome);

      if (nextLevelTimerRef.current) {
        window.clearTimeout(nextLevelTimerRef.current);
        nextLevelTimerRef.current = null;
      }
    };
  }, [navigate]);

  const resultClassName = useMemo(() => {
    if (result.type === "success") {
      return `${styles.resultBanner} ${styles.resultSuccess}`;
    }

    if (result.type === "error") {
      return `${styles.resultBanner} ${styles.resultError}`;
    }

    return styles.resultBanner;
  }, [result.type]);

  const exitButton = () => {
    navigate("/dashboard");
  };

  const runLevelCheck = () => {
    if (nextLevelTimerRef.current) {
      window.clearTimeout(nextLevelTimerRef.current);
      nextLevelTimerRef.current = null;
    }

    const sourceCode = code ?? "";
    const validation = validateLevelOneCode(sourceCode);
    const { isCorrect, message } = validation;

    gameEvents.emit(LEVEL_ONE_CODE_EVALUATED, { isCorrect });

    setResult({
      type: isCorrect ? "success" : "error",
      message,
    });
  };

  const uiAssetBase = `${import.meta.env.BASE_URL}game/assets/ui/dialogue`;

  const storyIntro = [
    {
      speaker: "King Kai",
      lines: [
        { text: "I am the King kai.", tone: "normal" },
        { text: "No one is cooler than me.", tone: "accent" },
      ],
    },
    {
      speaker: "King Kai",
      lines: [
        { text: "This gate obeys only exact declarations.", tone: "normal" },
        {
          text: 'Use: string heroName = "Kai"; and string action = "walk";',
          tone: "goal",
        },
      ],
    },
    {
      speaker: "Green King",
      lines: [
        {
          text: "Write the code correctly and begin your journey.",
          tone: "normal",
        },
      ],
    },
  ];

  const activeDialogue = storyIntro[dialogueStep];
  const isLastDialogue = dialogueStep === storyIntro.length - 1;
  const totalStepCharacters = activeDialogue.lines.reduce(
    (sum, line) => sum + line.text.length,
    0,
  );
  const isTyping = typedCharacters < totalStepCharacters;

  const displayedLines = useMemo(() => {
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
  }, [dialogueStep]);

  useEffect(() => {
    if (!showStoryIntro) return undefined;
    if (typedCharacters >= totalStepCharacters) return undefined;

    const timer = window.setTimeout(() => {
      setTypedCharacters((current) =>
        Math.min(current + 1, totalStepCharacters),
      );
    }, DIALOGUE_TYPING_SPEED_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showStoryIntro, typedCharacters, totalStepCharacters]);

  const nextDialogue = () => {
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

  return (
    <div className={styles.gameContainer}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>The Castle of Syntax</h1>
          <span>Level 1 - The Awakening</span>
        </div>
        <Button label="Exit" variant="outline" size="sm" onClick={exitButton} />
      </header>

      <main className={styles.mainLayout}>
        {/* UPPER ROW (ORANGE): Phaser (1) + Editor (2) */}
        <div className={styles.upperRow}>
          <div id="phaser-canvas-root" className={styles.phaserCanvasRoot}>
            <Game />
            {showStoryIntro && (
              <div className={styles.storyOverlay}>
                <div className={styles.storyContainer}>
                  <div className={styles.storyChapter}>
                    Chapter 1: The Awakening
                  </div>

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
                        src={`${uiAssetBase}/portrait_player_main.png`}
                        alt="Green King portrait"
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

        {/* LOWER ROW (GREEN): Goals (1) + Lessons (2) */}
        <div className={styles.lowerRow}>
          <section className={styles.card}>
            <h3>Goal</h3>
            <p>
              Declare exactly the two goal variables to move your character and
              open the gate.
            </p>
            <h3>Instruction</h3>
            <ul>
              <li>
                Use exactly: <b>string heroName = "Kai";</b>
              </li>
              <li>
                Then add: <b>string action = "walk";</b>
              </li>
              <li>Any other variable declaration will fail this level.</li>
            </ul>
          </section>

          <section className={styles.card}>
            <h3>Declaring Variables</h3>
            <p>
              For Level 1, the checker is strict and goal-based. It only accepts
              the exact declarations required by the mission.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default LevelOne;
