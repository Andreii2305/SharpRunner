import LevelOneScene from "../scenes/LevelOneScene";
import { createExactGoalDeclarationValidator } from "./validators";

const LESSON_KEY = "variables-and-data-types";
const GAME_ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const DIALOGUE_ASSET_BASE = `${GAME_ASSET_BASE}/ui/dialogue`;

const LEVEL_ONE_GOALS = [
  {
    name: "heroName",
    allowedTypes: ["string"],
    requiredValue: '"Kai"',
  },
  {
    name: "action",
    allowedTypes: ["string"],
    requiredValue: '"walk"',
  },
];

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
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare Variable Here\n\n    }\n  }\n}",
    idleResultMessage: "Declare at least one variable, then click Run.",
    successResultMessage:
      "Great job. Portal reached and level objective completed.",
    errorResultMessage: "You failed. Declare the required variables and retry.",
    goal: {
      title: "Goal",
      description:
        "Declare exactly the two goal variables to move your character and open the portal.",
    },
    instruction: {
      title: "Instruction",
      items: [
        'Use exactly: string heroName = "Kai";',
        'Then add: string action = "walk";',
        "Any other variable declaration will fail this level.",
      ],
    },
    lessonCard: {
      title: "Declaring Variables",
      description:
        "For Level 1, the checker is strict and goal-based. It only accepts the exact declarations required by the mission.",
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
            { text: "No one is cooler than me.", tone: "accent" },
          ],
        },
        {
          speaker: "King Kai",
          lines: [
            { text: "This portal obeys only exact declarations.", tone: "normal" },
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
      ],
    },
    validateCode: createExactGoalDeclarationValidator({
      goals: LEVEL_ONE_GOALS,
      unexpectedVariableMessage:
        'Unexpected variable. Only "heroName" and "action" are allowed in Level 1.',
      successMessage:
        "Exact goal declarations found. Character is moving to the portal.",
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
