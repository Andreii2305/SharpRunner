import LevelOneScene from "../scenes/LevelOneScene";
import LevelTwoScene from "../scenes/LevelTwoScene";
import LevelThreeScene from "../scenes/LevelThreeScene";
import {
  createExactGoalDeclarationValidator,
  createMultiStringDeclarationValidator,
  createSingleIntegerDeclarationValidator,
} from "./validators";

const LESSON_KEY = "variables-and-data-types";
const GAME_ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const DIALOGUE_ASSET_BASE = `${GAME_ASSET_BASE}/ui/dialogue`;

const LEVEL_CONFIG_BY_NUMBER = {
  1: {
    levelNumber: 1,
    lessonKey: LESSON_KEY,
    parTimeSeconds: 900,
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
    hint: "Count the tiles between your character and the portal carefully. Set int steps to exactly that number.",
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
    validatorConfig: {
      type: "singleInteger",
      variableName: "steps",
      minValue: 1,
      maxValue: 40,
      unexpectedVariableMessage: 'Unexpected variable. Only "steps" is allowed in Level 1.',
      successMessage: "Code accepted. Executing walk steps...",
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
  2: {
    levelNumber: 2,
    lessonKey: LESSON_KEY,
    parTimeSeconds: 900,
    title: "The Castle of Syntax",
    subtitle: "Level 2 - What Is Your Name?",
    chapterLabel: "Chapter 2: The Name Gate",
    scene: LevelTwoScene,
    sceneKey: "LevelTwoScene",
    progressKey: `${LESSON_KEY}-level-2`,
    nextRoute: "/Map",
    nextDelayMs: 1300,
    startWithDialogue: false,
    lockCodeUntilDialogueDone: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void IntroduceToNpc(string name) {\n      // Dialogue animation is handled by the game engine.\n    }\n\n    static void Main(string[] args) {\n      string myName = \"\";\n      IntroduceToNpc(myName);\n    }\n  }\n}",
    hint: 'Declare exactly: string myName = "Kai"; — use lowercase string, double quotes, and the exact name Kai.',
    idleResultMessage: "Declare your name variable, then click Run.",
    successResultMessage:
      'Correct. NPC accepted: "Kai". Proceeding to next level.',
    errorResultMessage:
      'You failed. Use only this declaration: string myName = "Kai";',
    goal: {
      title: "Goal",
      description:
        'Declare exactly one string variable so the NPC can identify the hero name.',
    },
    instruction: {
      title: "Instruction",
      items: [
        'Use exactly: string myName = "Kai";',
        'Only lowercase string is accepted in this level.',
        "Do not declare any other variable in this level.",
      ],
    },
    lessonCard: {
      title: "String Variables",
      description:
        "In this level, the NPC reads one exact string variable. This checker is strict and accepts only the required declaration.",
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "King Kai portrait",
      intro: [
        {
          speaker: "Gatekeeper",
          portraitImage: "gatekeeper_portrait.png",
          portraitAlt: "Gatekeeper portrait",
          lines: [
            { text: "Traveler, name yourself before entering.", tone: "normal" },
          ],
        },
        {
          speaker: "King Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "King Kai portrait",
          lines: [
            { text: 'Declare exactly: string myName = "Kai";', tone: "goal" },
            { text: "Then press Run so I can introduce myself.", tone: "normal" },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "exactGoal",
      goals: [{ name: "myName", allowedTypes: ["string"], requiredValue: '"Kai"' }],
      unexpectedVariableMessage: 'Unexpected variable. Only "myName" is allowed in Level 2.',
      strictCountMessage: 'Only this declaration is accepted: string myName = "Kai";',
      successMessage: 'Code accepted. Introducing "Kai" to the NPC...',
    },
    validateCode: createExactGoalDeclarationValidator({
      goals: [
        {
          name: "myName",
          allowedTypes: ["string"],
          requiredValue: '"Kai"',
        },
      ],
      unexpectedVariableMessage:
        'Unexpected variable. Only "myName" is allowed in Level 2.',
      strictCountMessage:
        'Only this declaration is accepted: string myName = "Kai";',
      successMessage: 'Code accepted. Introducing "Kai" to the NPC...',
    }),
  },
  3: {
    levelNumber: 3,
    lessonKey: LESSON_KEY,
    parTimeSeconds: 900,
    title: "The Castle of Syntax",
    subtitle: "Level 3 - Voices of the Village",
    chapterLabel: "Chapter 3: Voices of the Village",
    scene: LevelThreeScene,
    sceneKey: "LevelThreeScene",
    progressKey: `${LESSON_KEY}-level-3`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: false,
    defaultCode:
      'using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      string voice1 = "";\n      string voice2 = "";\n      string voice3 = "";\n    }\n  }\n}',
    hint: 'Declare three string variables: string voice1 = "hello"; string voice2 = "world"; string voice3 = "hi"; — any non-empty quoted values are accepted.',
    idleResultMessage: "Declare voice1, voice2, and voice3, then click Run.",
    successResultMessage:
      "All three voices restored. The route is now open. Level 3 cleared.",
    errorResultMessage:
      "Invalid code. Declare voice1, voice2, and voice3 as non-empty strings.",
    goal: {
      title: "Goal",
      description:
        "Declare three string variables to restore the voices of the frozen villagers.",
    },
    instruction: {
      title: "Instruction",
      items: [
        'Declare exactly three variables: voice1, voice2, and voice3.',
        'Each must use type string and be assigned any non-empty quoted value.',
        'Example: string voice1 = "hello"; — the value can be any word or phrase.',
        "No other variable declarations are allowed in this level.",
      ],
    },
    lessonCard: {
      title: "String Variables",
      description:
        "A string stores text. Use double quotes around the value. Any non-empty string is accepted here — the content is your choice.",
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "King Kai portrait",
      intro: [],
    },
    validatorConfig: {
      type: "multiString",
      variableNames: ["voice1", "voice2", "voice3"],
      unexpectedVariableMessage:
        'Unexpected variable. Only "voice1", "voice2", and "voice3" are allowed in Level 3.',
      successMessage: "All voices declared. Unfreezing villagers...",
    },
    validateCode: createMultiStringDeclarationValidator({
      variableNames: ["voice1", "voice2", "voice3"],
      unexpectedVariableMessage:
        'Unexpected variable. Only "voice1", "voice2", and "voice3" are allowed in Level 3.',
      successMessage: "All voices declared. Unfreezing villagers...",
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
