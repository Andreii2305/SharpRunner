import LevelOneScene from "../scenes/LevelOneScene";
import { createSingleIntegerDeclarationValidator } from "./validators";

const LESSON_KEY = "variables-and-data-types";
const GAME_ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const DIALOGUE_ASSET_BASE = `${GAME_ASSET_BASE}/ui/dialogue`;

const LEVEL_CONFIG_BY_NUMBER = {
  1: {
    levelNumber: 1,
    lessonKey: LESSON_KEY,
    title: "The Castle of Syntax",
    subtitle: "Level 1 - The Awakening",
    chapterLabel: "Chapter 1: The Awakening",
    scene: LevelOneScene,
    sceneKey: "LevelOneScene",
    progressKey: `${LESSON_KEY}-level-1`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void WalkToPortal(int distanceInSteps) {\n      // Movement is handled by the game engine.\n    }\n\n    static void Main(string[] args) {\n      int steps = 0;\n      WalkToPortal(steps);\n    }\n  }\n}",
    idleResultMessage: "Set int steps, then click Run.",
    successResultMessage:
      "Great job. Portal reached and level objective completed.",
    errorResultMessage:
      "You failed. Use one int steps declaration and set the correct distance.",
    goal: {
      title: "Goal",
      description:
        "Declare one integer variable to control how far the hero walks to the portal.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Use exactly one declaration: int steps = <number>;",
        "Set steps so the hero lands exactly on the portal.",
        "Do not add other variable declarations in this level.",
      ],
    },
    lessonCard: {
      title: "Declaring Variables",
      description:
        "Level 1 focuses on integer variable declaration. walk() is already predefined in starter code for this lesson.",
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Green King portrait",
      intro: [
        {
          speaker: "King Kai",
          lines: [
            { text: "I am King Kai.", tone: "normal" },
            { text: "Today, you control distance with one variable.", tone: "accent" },
          ],
        },
        {
          speaker: "King Kai",
          lines: [
            { text: "walk() is already prepared for you.", tone: "normal" },
            {
              text: "Set int steps to the portal distance, then Run.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Green King",
          lines: [
            {
              text: "Use the right value and I will walk straight into the portal.",
              tone: "normal",
            },
          ],
        },
      ],
    },
    validateCode: createSingleIntegerDeclarationValidator({
      variableName: "steps",
      minValue: 1,
      maxValue: 40,
      unexpectedVariableMessage:
        'Unexpected variable. Only "steps" is allowed in Level 1.',
      successMessage:
        "Code accepted. Executing walk steps...",
    }),
  },
};

export const getLevelConfig = (levelNumber) =>
  LEVEL_CONFIG_BY_NUMBER[Number(levelNumber)] ?? null;

export const isLevelAvailable = (levelNumber) =>
  Boolean(getLevelConfig(levelNumber));

export const getAvailableLevelNumbers = () =>
  Object.keys(LEVEL_CONFIG_BY_NUMBER)
    .map((value) => Number(value))
    .sort((a, b) => a - b);
