import LevelOneScene from "../scenes/LevelOneScene";
import LevelTwoScene from "../scenes/LevelTwoScene";
import LevelThreeScene from "../scenes/LevelThreeScene";
import LevelFourScene from "../scenes/LevelFourScene";
import LevelFiveScene from "../scenes/LevelFiveScene";
import ArraysLevelOneScene from "../scenes/ArraysLevelOneScene";
import ArraysLevelTwoScene from "../scenes/ArraysLevelTwoScene";
import ArraysLevelThreeScene from "../scenes/ArraysLevelThreeScene";
import ArraysLevelFourScene from "../scenes/ArraysLevelFourScene";
import ArraysLevelFiveScene from "../scenes/ArraysLevelFiveScene";
import ArraysLevelSixScene from "../scenes/ArraysLevelSixScene";
import ArraysLevelSevenScene from "../scenes/ArraysLevelSevenScene";
import ArraysLevelEightScene from "../scenes/ArraysLevelEightScene";
import MethodsLevelOneScene from "../scenes/MethodsLevelOneScene";
import MethodsBellOfDawnScene from "../scenes/MethodsBellOfDawnScene";
import MethodsLevelTwoScene from "../scenes/MethodsLevelTwoScene";
import MethodsSealCursedShrineScene from "../scenes/MethodsSealCursedShrineScene";
import MethodsOracleStoneScene from "../scenes/MethodsOracleStoneScene";
import MethodsDiwatasSafePathScene from "../scenes/MethodsDiwatasSafePathScene";
import MethodsShrineOfferingScene from "../scenes/MethodsShrineOfferingScene";
import MethodsSaltAgainstAswangScene from "../scenes/MethodsSaltAgainstAswangScene";
import MethodsAntingAntingPowerScene from "../scenes/MethodsAntingAntingPowerScene";
import MethodsHealingRitualScene from "../scenes/MethodsHealingRitualScene";
import MethodsEndlessBambooStairsScene from "../scenes/MethodsEndlessBambooStairsScene";
import FunctionsArraysLanternLineScene from "../scenes/FunctionsArraysLanternLineScene";
import FunctionsArraysCountCursedCharmsScene from "../scenes/FunctionsArraysCountCursedCharmsScene";
import FunctionsArraysRestoreWardingGridScene from "../scenes/FunctionsArraysRestoreWardingGridScene";
import FunctionsArraysAncientCemeteryScene from "../scenes/FunctionsArraysAncientCemeteryScene";
import FunctionsArraysBakunawaEclipseScene from "../scenes/FunctionsArraysBakunawaEclipseScene";
import {
  createExactIntegerArrayDeclarationValidator,
  createExactInteger2DArrayDeclarationValidator,
  createExactStringArrayDeclarationValidator,
  createStringArrayAccessValidator,
  createExactGoalDeclarationValidator,
  createMultiStringDeclarationValidator,
  createSingleIntegerDeclarationValidator,
  createStringArrayTraversalValidator,
  createPredefinedVoidMethodCallValidator,
  createPredefinedVoidMethodArgumentValidator,
  createVoidMethodDefinitionCallValidator,
  createVoidMethodParameterCallValidator,
  createIntReturnMethodValidator,
  createIntParameterReturnMethodValidator,
  createStringReturnMethodValidator,
  createRecursiveStairMethodValidator,
  createVoidMethodIntegerArrayParameterValidator,
  createVoidMethodInteger2DArrayParameterValidator,
  createCursedCharmCountMethodValidator,
  createBlessedGraveCount2DMethodValidator,
  createBakunawaFinaleValidator,
} from "./validators";

const LESSON_KEY = "tutorial";
const ARRAYS_LESSON_KEY = "arrays";
const METHODS_LESSON_KEY = "functions";
const FUNCTIONS_ARRAYS_LESSON_KEY = "functions-with-arrays";
const FINAL_LESSON_KEY = "final";
const GAME_ASSET_BASE = `${import.meta.env.BASE_URL}game/assets`;
const DIALOGUE_ASSET_BASE = `${GAME_ASSET_BASE}/ui/dialogue`;

const LEVEL_CONFIG_BY_NUMBER = {
  1: {
    levelNumber: 1,
    lessonKey: LESSON_KEY,
    parTimeSeconds: 900,
    title: "First Compile Trial",
    subtitle: "Tutorial 1 - The Awakening",
    chapterLabel: "Tutorial 1: The Awakening",
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
        "A variable is a named storage location for a value. In C#, you declare a variable by writing its type, its name, and optionally an initial value.",
      sections: [
        {
          title: "Variable Parts",
          body:
            "A declaration usually has three parts: the data type, the variable name, and the value assigned with =.",
          code: "int steps = 10;",
        },
        {
          title: "Why Types Matter",
          body:
            "The type tells C# what kind of value the variable can store. An int stores whole numbers, which makes it useful for counts, distances, scores, and quantities.",
        },
        {
          title: "Common Mistake",
          body:
            "A variable must be declared before it is used. The name must also match exactly, including spelling and capitalization.",
        },
        {
          title: "In This Level",
          body:
            "The walking function is already prepared. Your job is to declare one integer variable that stores the distance Kai should walk.",
        },
      ],
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
    title: "First Compile Trial",
    subtitle: "Tutorial 2 - What Is Your Name?",
    chapterLabel: "Tutorial 2: The Name Gate",
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
        "A string stores text. Use strings for names, words, labels, dialogue, item names, and any value made of characters.",
      sections: [
        {
          title: "String Syntax",
          body:
            "String values must be written inside double quotes. The quotes tell C# that the value is text, not a variable name.",
          code: 'string playerName = "Kai";',
        },
        {
          title: "Exact Text",
          body:
            "String values can be case-sensitive. \"Kai\" and \"kai\" are different text values because the first letter is not the same.",
        },
        {
          title: "Common Mistake",
          body:
            "Forgetting the quotes makes C# look for another variable instead of reading text.",
          code: 'string name = "Maya";',
        },
        {
          title: "In This Level",
          body:
            "The gatekeeper checks one exact name variable. The declaration has to match the required name and value.",
        },
      ],
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
    title: "First Compile Trial",
    subtitle: "Tutorial 3 - Voices of the Village",
    chapterLabel: "Tutorial 3: Voices of the Village",
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
        "Strings are used whenever a program needs to store text. You can create many string variables when different pieces of text need separate names.",
      sections: [
        {
          title: "Multiple Text Values",
          body:
            "Each variable has its own name and stores its own value. This is useful when different text values have different meanings.",
          code: 'string greeting = "hello";\nstring warning = "careful";',
        },
        {
          title: "Meaningful Names",
          body:
            "Good variable names explain what the value represents. A name like voice1 is clearer than a random name like x when the value is a villager voice.",
        },
        {
          title: "Common Mistake",
          body:
            "Declaring the same variable name twice in the same scope is not allowed. Each variable name must be unique there.",
        },
        {
          title: "In This Level",
          body:
            "Each frozen villager needs a separate non-empty string value. The exact words are your choice, but all three required variables must exist.",
        },
      ],
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
  4: {
    levelNumber: 4,
    lessonKey: LESSON_KEY,
    parTimeSeconds: 900,
    title: "First Compile Trial",
    subtitle: "Tutorial 4 - The Coin Keeper",
    chapterLabel: "Tutorial 4: The Coin Keeper",
    scene: LevelFourScene,
    sceneKey: "LevelFourScene",
    startWithDialogue: false,
    lockCodeUntilDialogueDone: true,
    progressKey: `${LESSON_KEY}-level-4`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      int coins = 0;\n    }\n  }\n}",
    hint: "The toll sign shows 20. Declare: int coins = 20; — set coins to exactly the toll amount.",
    idleResultMessage: "Declare your coin purse, then click Run.",
    successResultMessage: "Toll paid. Bridge lowered. Proceeding to next level.",
    errorResultMessage: "Invalid code. Declare: int coins = 20;",
    goal: {
      title: "Goal",
      description:
        "Declare one integer variable representing how many coins you carry to pay the toll and lower the bridge.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Use exactly one declaration: int coins = <number>;",
        "The toll sign shows the required amount — match it exactly.",
        "Do not declare any other variables in this level.",
      ],
    },
    lessonCard: {
      title: "Integer Variables",
      description:
        "An integer stores a whole number. Use int for values that are counted without decimals, such as coins, lives, steps, points, or item counts.",
      sections: [
        {
          title: "Whole Numbers",
          body:
            "The int type cannot store decimal values. It is meant for numbers like 0, 1, 20, or -5.",
          code: "int coins = 20;",
        },
        {
          title: "When To Use int",
          body:
            "Use int when the value represents a count or quantity that should not have fractions.",
        },
        {
          title: "Common Mistake",
          body:
            "Writing a decimal value for an int is invalid because decimals require a different numeric type.",
          code: "double price = 4.5;",
        },
        {
          title: "In This Level",
          body:
            "The toll accepts one whole-number coin count. The variable must match the amount shown by the scene.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "King Kai portrait",
      intro: [
        {
          speaker: "Toll Collector",
          portraitImage: "gatekeeper_portrait.png",
          portraitAlt: "Toll Collector portrait",
          lines: [
            { text: "I can't lower the bridge for a man with no counted coins.", tone: "normal" },
            { text: "Declare your purse. The toll is posted on the sign.", tone: "accent" },
          ],
        },
        {
          speaker: "King Kai",
          lines: [
            { text: "I need to declare: int coins = 20;", tone: "goal" },
            { text: "Then the bridge will lower and I can cross.", tone: "normal" },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "singleInteger",
      variableName: "coins",
      minValue: 20,
      maxValue: 20,
      unexpectedVariableMessage: 'Unexpected variable. Only "coins" is allowed in Level 4.',
      successMessage: "Code accepted. Paying toll...",
    },
    validateCode: createSingleIntegerDeclarationValidator({
      variableName: "coins",
      minValue: 20,
      maxValue: 20,
      unexpectedVariableMessage: 'Unexpected variable. Only "coins" is allowed in Level 4.',
      successMessage: "Code accepted. Paying toll...",
    }),
  },
  5: {
    levelNumber: 5,
    lessonKey: LESSON_KEY,
    parTimeSeconds: 900,
    title: "First Compile Trial",
    subtitle: "Tutorial 5 - Potion Measure",
    chapterLabel: "Tutorial 5: Potion Measure",
    scene: LevelFiveScene,
    sceneKey: "LevelFiveScene",
    progressKey: `${LESSON_KEY}-level-5`,
    nextRoute: "/Map/level/6",
    nextDelayMs: 1200,
    startWithDialogue: false,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      double measurement = 0.0;\n    }\n  }\n}",
    hint: "The seal inscription shows 4.5. Declare: double measurement = 4.5; — use double, not int.",
    idleResultMessage: "Declare your measurement, then click Run.",
    successResultMessage: "Seal shattered. The cauldron awakens. Level 5 cleared.",
    errorResultMessage: 'Invalid code. Declare: double measurement = 4.5;',
    goal: {
      title: "Goal",
      description:
        "Declare one decimal variable matching the value etched on the force seal to shatter it and activate the cauldron.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Use exactly one declaration: double measurement = <value>;",
        "The seal inscription shows the required decimal number — match it exactly.",
        "Use type double (not int) — whole numbers will be rejected.",
        "Do not declare any other variables in this level.",
      ],
    },
    lessonCard: {
      title: "Double Variables",
      description:
        "A double stores a number that can include a decimal point. Use it when a value needs fractional precision instead of only whole numbers.",
      sections: [
        {
          title: "Decimal Values",
          body:
            "Double values can represent measurements like 4.5, 0.75, or 12.25.",
          code: "double measurement = 4.5;",
        },
        {
          title: "int vs double",
          body:
            "Use int for whole counts. Use double for measurements, weights, distances, percentages, and other values that may include fractions.",
        },
        {
          title: "Common Mistake",
          body:
            "Using int for a decimal measurement loses the ability to represent the fractional part.",
        },
        {
          title: "In This Level",
          body:
            "The seal requires a precise decimal measurement. A whole-number variable is not enough for this task.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "King Kai portrait",
      intro: [
        {
          speaker: "Alchemist",
          portraitImage: "gatekeeper_portrait.png",
          portraitAlt: "Alchemist portrait",
          lines: [
            { text: "Whole numbers won't do here. The seal demands precision.", tone: "normal" },
            { text: "A fraction of truth — etched right there on the inscription.", tone: "accent" },
          ],
        },
        {
          speaker: "King Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "King Kai portrait",
          lines: [
            { text: "I need to declare: double measurement = 4.5;", tone: "goal" },
            { text: "Then the seal will shatter and the cauldron will respond.", tone: "normal" },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "exactGoal",
      goals: [{ name: "measurement", allowedTypes: ["double", "float"], requiredValue: "4.5" }],
      unexpectedVariableMessage: 'Unexpected variable. Only "measurement" is allowed in Level 5.',
      strictCountMessage: 'Only this declaration is accepted: double measurement = 4.5;',
      successMessage: "Code accepted. Shattering seal...",
    },
    validateCode: createExactGoalDeclarationValidator({
      goals: [{ name: "measurement", allowedTypes: ["double", "float"], requiredValue: "4.5" }],
      unexpectedVariableMessage: 'Unexpected variable. Only "measurement" is allowed in Level 5.',
      strictCountMessage: 'Only this declaration is accepted: double measurement = 4.5;',
      successMessage: "Code accepted. Shattering seal...",
    }),
  },
  6: {
    levelNumber: 6,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Barangay Malumay",
    subtitle: "Arrays 1 - Lantern Row",
    chapterLabel: "Arrays 1: Lantern Row",
    scene: ArraysLevelOneScene,
    sceneKey: "ArraysLevelOneScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-1`,
    nextRoute: "/Map/level/7",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare the lantern order here.\n    }\n  }\n}",
    hint: "Use one int array named lanterns. The four marker numbers in the scene show the values and their order.",
    idleResultMessage: "Declare the lantern array, then click Run.",
    successResultMessage:
      "The lanterns accept the array. The gate opens.",
    errorResultMessage:
      "Invalid array. Use exactly: int[] lanterns = { 1, 2, 3, 4 };",
    goal: {
      title: "Goal",
      description:
        "Declare one integer array that stores the lantern order for the haunted path.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Use exactly one array declaration: int[] lanterns = { ... };",
        "Place the numbers in the same order as the lantern markers.",
        "For this first array level, the required order is 1, 2, 3, 4.",
        "Do not declare other variables in this level.",
      ],
    },
    lessonCard: {
      title: "Arrays",
      description:
        "An array stores multiple related values of the same type under one variable name. Arrays are useful when values belong together and should be handled as one ordered group.",
      sections: [
        {
          title: "Why Use Arrays",
          body:
            "Without arrays, four related values might need four separate variables. With an array, the values stay grouped and ordered.",
          code: "int[] numbers = { 1, 2, 3, 4 };",
        },
        {
          title: "Array Syntax",
          body:
            "In C#, an array declaration has a type, square brackets, a name, and values inside braces.",
          code: "int[] variableName = { value1, value2, value3 };",
        },
        {
          title: "Same Type Rule",
          body:
            "Every value in an int[] must be an int. Every value in a string[] must be a string. Mixing unrelated types in one array is not allowed.",
        },
        {
          title: "Order Matters",
          body:
            "Arrays keep values in the order you write them. The first value becomes the first item, the second value becomes the second item, and so on. For this path, the lanterns read the array from left to right.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not create separate variables when the task asks for one array. The point is to group related values together.",
        },
        {
          title: "How To Solve This Level",
          items: [
            "Look at each lantern marker on the path.",
            "Use one int array named lanterns.",
            "Write the marker numbers in the same left-to-right order.",
            "Do not create separate variables for each lantern.",
          ],
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Kai",
          lines: [
            {
              text: "Barangay Malumay is too dark. The path only wakes when the lanterns light in order.",
              tone: "normal",
            },
            {
              text: "Each lantern marker shows one number. I need to collect those numbers into one list.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "In C#, an array stores many values under one variable name.",
              tone: "normal",
            },
            {
              text: "Since the lantern markers are whole numbers, I need an int array named lanterns.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "I should write the numbers in the same left-to-right order they appear on the path.",
              tone: "normal",
            },
            {
              text: "If my array matches the lantern order, each lamp will light as I pass.",
              tone: "normal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "exactIntegerArray",
      variableName: "lanterns",
      expectedValues: [1, 2, 3, 4],
      unexpectedVariableMessage:
        'Unexpected array. Only "lanterns" is allowed in Arrays Level 1.',
      successMessage: "Code accepted. Lighting the lantern row...",
    },
    validateCode: createExactIntegerArrayDeclarationValidator({
      variableName: "lanterns",
      expectedValues: [1, 2, 3, 4],
      unexpectedVariableMessage:
        'Unexpected array. Only "lanterns" is allowed in Arrays Level 1.',
      successMessage: "Code accepted. Lighting the lantern row...",
    }),
  },
  7: {
    levelNumber: 7,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Likod Bahay",
    subtitle: "Arrays 2 - Protect the Supplies",
    chapterLabel: "Arrays 2: Protect the Supplies",
    scene: ArraysLevelTwoScene,
    sceneKey: "ArraysLevelTwoScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-2`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare the supplies array here.\n    }\n  }\n}",
    hint:
      'Use one string array named supplies. String values need double quotes, and the crate labels show the correct order.',
    idleResultMessage: "Declare the supplies array, then click Run.",
    successResultMessage: "The supplies are protected. The aswang retreats.",
    errorResultMessage:
      "Invalid supplies array. Use one string[] named supplies with the crate items in order.",
    goal: {
      title: "Goal",
      description:
        "Declare one string array that stores the supplies in the order shown by the crates.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Use exactly one array declaration: string[] supplies = { ... };",
        "Use double quotes around every text value.",
        "Place the supplies in crate order: rice, salt, candle.",
        "Do not declare other variables in this level.",
      ],
    },
    lessonCard: {
      title: "String Arrays",
      description:
        "A string array stores multiple text values under one variable name. Use it when names, labels, words, item names, or commands belong to one collection.",
      sections: [
        {
          title: "Text Collections",
          body:
            "If several text values describe the same kind of thing, a string array keeps them together in one ordered list.",
          code: 'string[] items = { "rice", "salt", "candle" };',
        },
        {
          title: "Array Type",
          body:
            "The type before the square brackets tells C# what kind of values the array can store. For item names, use string[].",
          code: 'string[] variableName = { "first", "second", "third" };',
        },
        {
          title: "Quoted Values",
          body:
            "Each text value must be wrapped in double quotes. Without quotes, C# will read the word as a variable name instead of text.",
        },
        {
          title: "Order In Arrays",
          body:
            "The first string you write is stored first, the second string is stored second, and so on. If a program reads the array in order, changing the order changes the result.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not forget commas between values. Commas separate one string value from the next.",
          code: 'string[] names = { "Ana", "Ben", "Cara" };',
        },
        {
          title: "How To Solve This Level",
          items: [
            "Read the crate labels from left to right.",
            "Create one array named supplies.",
            "Write each supply as a quoted string.",
            "Keep the same order so the crates open correctly.",
          ],
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Kai",
          lines: [
            {
              text: "The supply crates are still on the path behind the houses.",
              tone: "normal",
            },
            {
              text: "An aswang is flying overhead. If I leave them here, it will swoop down and steal them one by one.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "I need to collect the crates and bring them to the safe house for safety.",
              tone: "normal",
            },
            {
              text: "The code must group the supply names into one string array.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "Every item name must use double quotes, and the order must match the crates.",
              tone: "normal",
            },
            {
              text: "If the array is correct, I can carry the supplies to safety before the aswang takes them.",
              tone: "normal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "exactStringArray",
      variableName: "supplies",
      expectedValues: ["rice", "salt", "candle"],
      unexpectedVariableMessage:
        'Unexpected array. Only "supplies" is allowed in Arrays Level 2.',
      successMessage: "Code accepted. Opening the supply crates...",
    },
    validateCode: createExactStringArrayDeclarationValidator({
      variableName: "supplies",
      expectedValues: ["rice", "salt", "candle"],
      unexpectedVariableMessage:
        'Unexpected array. Only "supplies" is allowed in Arrays Level 2.',
      successMessage: "Code accepted. Opening the supply crates...",
    }),
  },
  8: {
    levelNumber: 8,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Road of Santelmo",
    subtitle: "Arrays 3 - Boss Fire Index",
    chapterLabel: "Arrays 3: Boss Fire Index",
    scene: ArraysLevelThreeScene,
    sceneKey: "ArraysLevelThreeScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-3`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare the flames array and choose one flame to attack.\n    }\n  }\n}",
    hint:
      'Label each flame as "normal" or "boss" inside a string array named flames, then assign attack using flames[index].',
    idleResultMessage: "Choose which indexed flame Kai should attack, then click Run.",
    successResultMessage: "Boss fire destroyed. The road is open.",
    errorResultMessage:
      "Invalid attack target. Use the flames array and choose the boss fire by index.",
    goal: {
      title: "Goal",
      description:
        "Declare the flame array, then use one array index access to choose the boss fire Kai should attack.",
    },
    instruction: {
      title: "Instruction",
      items: [
        'Declare exactly one string array named flames.',
        'Label each flame as "normal" if it is ordinary or "boss" if it controls the flame line.',
        "Declare exactly one string variable named attack.",
        "Assign attack using flames[index], not a hardcoded word.",
        "Use the index of the flame you believe Kai should attack.",
      ],
    },
    lessonCard: {
      title: "One Dimensional Arrays",
      description:
        "A one-dimensional array stores values in a single ordered row. Each value has an index, and C# starts counting those indexes at 0.",
      sections: [
        {
          title: "One Row Of Values",
          body:
            "A one-dimensional array is like one straight line of boxes. Each box stores one value, and each box can be reached by its position number.",
        },
        {
          title: "Index Positions",
          body:
            "The first item is index 0, the second item is index 1, the third item is index 2, and so on.",
          code: 'string[] signs = { "first", "second", "third", "fourth" };',
        },
        {
          title: "Reading One Value",
          body:
            "Use the array name and square brackets to read one value from the row. The index inside the brackets decides which item is selected.",
          code: "string selectedSign = signs[index];",
        },
        {
          title: "Zero-Based Counting",
          body:
            "Because C# starts at 0, the third item is not index 3. The third item is index 2.",
        },
        {
          title: "Common Mistake",
          body:
            "Using an index that is too large causes an error. For an array with 4 values, the valid indexes are 0, 1, 2, and 3.",
        },
        {
          title: "How To Solve This Level",
          items: [
            'Look at the four flames and decide which one should be labeled "boss".',
            'Write all four labels in one string array named flames.',
            "Use the boss flame's index inside flames[index].",
            "Store the selected value in string attack.",
          ],
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Kai",
          lines: [
            {
              text: "Four Santelmo flames are blocking the road.",
              tone: "normal",
            },
            {
              text: "Only one of them is the boss fire controlling the whole flame line.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "I only have enough strength for one attack.",
              tone: "normal",
            },
            {
              text: "The flames are arranged like a one-dimensional array, counted from zero.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "If I attack the boss fire, the barrier should disappear.",
              tone: "normal",
            },
            {
              text: "If I choose a normal flame, it will burst back and the flame line will stay closed.",
              tone: "normal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "stringArrayAccess",
      arrayName: "flames",
      arrayValues: ["normal", "normal", "boss", "normal"],
      targetVariableName: "attack",
      expectedIndex: 2,
      unexpectedVariableMessage:
        'Use only string[] flames and string attack in Arrays Level 3.',
      successMessage: "Code accepted. Kai attacks the boss fire...",
    },
    validateCode: createStringArrayAccessValidator({
      arrayName: "flames",
      arrayValues: ["normal", "normal", "boss", "normal"],
      targetVariableName: "attack",
      expectedIndex: 2,
      unexpectedVariableMessage:
        'Use only string[] flames and string attack in Arrays Level 3.',
      successMessage: "Code accepted. Kai attacks the boss fire...",
    }),
  },
  9: {
    levelNumber: 9,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Midnight Inventory",
    subtitle: "Arrays 4 - Door Key Index",
    chapterLabel: "Arrays 4: Door Key Index",
    scene: ArraysLevelFourScene,
    sceneKey: "ArraysLevelFourScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-4`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare the inventory array and select the key by index.\n    }\n  }\n}",
    hint:
      'The crates are indexed from left to right. Store "candle", "key", and "map" in inventory, then select the key with inventory[1].',
    idleResultMessage: "Select the key from the inventory array, then click Run.",
    successResultMessage: "The key fits. The midnight door opens.",
    errorResultMessage:
      "Invalid inventory selection. Use string selectedItem = inventory[1]; to choose the key.",
    goal: {
      title: "Goal",
      description:
        "Declare an inventory array, then use one array index access to select the key for the locked house door.",
    },
    instruction: {
      title: "Instruction",
      items: [
        'Declare exactly one string array named **inventory**.',
        'Store the crate items in order: "candle", "key", "map".',
        "Declare exactly one string variable named **selectedItem**.",
        "Assign **selectedItem** using **inventory[index]**, not a hardcoded word.",
        "Use the index of the key crate.",
      ],
    },
    lessonCard: {
      title: "Array Index Access",
      description:
        "Array indexes let a program choose one value from an ordered collection. In C#, the first item is index 0, so the second item is index 1.",
      sections: [
        {
          title: "Inventory Slots",
          body:
            "An array can store item names in order. Each slot has a number that starts at 0.",
          code: 'string[] tools = { "rope", "torch", "compass" };',
        },
        {
          title: "Selecting One Item",
          body:
            "Use the array name and square brackets to read one item. The number inside the brackets chooses the slot.",
          code: "string chosenTool = tools[1];",
        },
        {
          title: "Zero-Based Indexes",
          body:
            "In the example above, tools[0] is rope, tools[1] is torch, and tools[2] is compass.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not write the answer as a plain string. The goal is to practice reading the value from the array by index.",
        },
        {
          title: "How To Solve This Level",
          items: [
            "Read the crate labels from left to right.",
            "Create one string array named inventory.",
            "Use inventory[1] because the key is in the second crate.",
            "Store that selected value in string selectedItem.",
          ],
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Villager",
          portraitImage: "villager1_portrait.png",
          portraitAlt: "Farmer villager portrait",
          lines: [
            {
              text: "Kai, I cannot open these crates by hand.",
              tone: "normal",
            },
            {
              text: "The key is inside the second crate. I need you to open that one.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "I need to store the crate labels in order, then pick one item by index.",
              tone: "normal",
            },
            {
              text: "Since C# counts from zero, the second crate is inventory[1].",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "If selectedItem reads the key from the array, I can open the crate and bring it to the villager.",
              tone: "normal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "stringArrayAccess",
      arrayName: "inventory",
      arrayValues: ["candle", "key", "map"],
      targetVariableName: "selectedItem",
      expectedIndex: 1,
      unexpectedVariableMessage:
        'Use only string[] inventory and string selectedItem in Arrays Level 4.',
      successMessage: "Code accepted. Kai selects the inventory key...",
    },
    validateCode: createStringArrayAccessValidator({
      arrayName: "inventory",
      arrayValues: ["candle", "key", "map"],
      targetVariableName: "selectedItem",
      expectedIndex: 1,
      unexpectedVariableMessage:
        'Use only string[] inventory and string selectedItem in Arrays Level 4.',
      successMessage: "Code accepted. Kai selects the inventory key...",
    }),
  },
  10: {
    levelNumber: 10,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Lumang Dambana",
    subtitle: "Arrays 5 - Warding Tile Grid",
    chapterLabel: "Arrays 5: Warding Tile Grid",
    scene: ArraysLevelFiveScene,
    sceneKey: "ArraysLevelFiveScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-5`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare int[,] ward using 1 for yellow ward runes.\n    }\n  }\n}",
    hint:
      "Use int[,] ward with 3 rows and 3 columns. Write 1 where the repeated yellow ward rune appears and 0 for the other runes.",
    idleResultMessage: "Declare the 3x3 int[,] ward array, then click Run.",
    successResultMessage: "The warding grid is restored. The path opens.",
    errorResultMessage:
      "Invalid ward grid. Use a 3x3 int[,] named ward with the exact pattern.",
    goal: {
      title: "Goal",
      description:
        "Declare a 3x3 int[,] array where 1 marks the yellow ward runes and 0 marks the other runes.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Use exactly one declaration: int[,] ward = { ... };",
        "Create 3 rows and 3 columns to match the rune grid.",
        "Use 1 for each repeated yellow ward rune.",
        "Use 0 for every other rune.",
        "Read the grid row by row from top-left to bottom-right.",
        "Do not use int[][] for this level.",
      ],
    },
    lessonCard: {
      title: "Multi-Dimensional Arrays",
      description:
        "A multi-dimensional array stores values by row and column. In this shrine, each number marks whether a rune belongs to the ward pattern.",
      sections: [
        {
          title: "Grid Syntax",
          body:
            "Each inner brace group represents one row of runes. The comma inside [] tells C# this is a two-dimensional rectangular array.",
          code:
            "int[,] ward = {\n  { 1, 0, 0 },\n  { 0, 1, 0 },\n  { 0, 0, 1 }\n};",
        },
        {
          title: "Rune States",
          body:
            "A 1 selects a yellow ward rune. A 0 skips the other runes. The shrine checks the grid row by row.",
        },
        {
          title: "Rows And Columns",
          body:
            "The first row controls the top rune row, the second row controls the middle row, and the third row controls the bottom row.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not use int[][] here. That is a jagged array, while this level is practicing int[,] rectangular arrays.",
        },
        {
          title: "How To Solve This Level",
          items: [
            "Read the rune grid row by row.",
            "Write 1 for each repeated yellow ward rune.",
            "Write 0 for every other rune.",
            "Place each row in its own braces.",
            "Name the array ward.",
          ],
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Kai",
          lines: [
            {
              text: "The old shrine floor is covered with runes. The ward seems to favor one repeated yellow mark.",
              tone: "normal",
            },
            {
              text: "I need to select the right rune states with rows and columns.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "In the code, 1 marks a yellow ward rune and 0 marks every other rune.",
              tone: "goal",
            },
            {
              text: "If my int[,] ward matches the shrine grid, the barrier should break and I can pass.",
              tone: "normal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "exactInteger2DArray",
      variableName: "ward",
      expectedRows: [
        [1, 0, 1],
        [0, 1, 0],
        [1, 0, 1],
      ],
      unexpectedVariableMessage:
        'Unexpected array. Only "ward" is allowed in Arrays Level 5.',
      successMessage: "Code accepted. Restoring the warding grid...",
    },
    validateCode: createExactInteger2DArrayDeclarationValidator({
      variableName: "ward",
      expectedRows: [
        [1, 0, 1],
        [0, 1, 0],
        [1, 0, 1],
      ],
      unexpectedVariableMessage:
        'Unexpected array. Only "ward" is allowed in Arrays Level 5.',
      successMessage: "Code accepted. Restoring the warding grid...",
    }),
  },
  11: {
    levelNumber: 11,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Ligaw na Landas",
    subtitle: "Arrays 6 - Branching Path Map",
    chapterLabel: "Arrays 6: Branching Path Map",
    scene: ArraysLevelSixScene,
    sceneKey: "ArraysLevelSixScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-6`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // Declare int[,] pathMap for the three route choices.\n    }\n  }\n}",
    hint:
      "Use int[,] pathMap with 3 rows and 3 columns. Rows are path heights; columns are checkpoints.",
    idleResultMessage: "Declare the 3x3 int[,] pathMap, then click Run.",
    successResultMessage: "The safe route is restored. Kai can cross the twisted forest.",
    errorResultMessage:
      "Invalid path map. Use a 3x3 int[,] named pathMap with the exact safe route.",
    goal: {
      title: "Goal",
      description:
        "Declare a 3x3 int[,] pathMap that marks one route through three checkpoints. Use 1 for the chosen path at each checkpoint and 0 for paths Kai should avoid.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Use exactly one declaration: int[,] pathMap = { ... };",
        "Create 3 rows and 3 columns.",
        "Rows represent the three path heights.",
        "Columns represent checkpoints 1, 2, and 3 from left to right.",
        "Each column should contain exactly one 1.",
        "Use 0 for routes not chosen.",
        "Do not use int[][] for this level.",
      ],
    },
    lessonCard: {
      title: "2D Arrays As Maps",
      description:
        "A two-dimensional array stores values by row and column. That makes it useful for grids, maps, boards, seating charts, tile layouts, and route choices.",
      sections: [
        {
          title: "General Idea",
          body:
            "In an int[,] array, every value has two positions: row first, then column. You can think of it like reading a grid: choose a row, choose a column, then read the value where they meet.",
        },
        {
          title: "Map Syntax",
          body:
            "Each inner brace group is one row. The commas inside that row separate the columns. This example shows the shape of a 3x3 map without giving away the forest route.",
          code:
            "int[,] pathMap = {\n  { 0, 1, 0 },\n  { 1, 0, 0 },\n  { 0, 0, 1 }\n};",
        },
        {
          title: "Rows And Columns",
          body:
            "Row 0 is the upper path, row 1 is the middle path, and row 2 is the lower path. Column 0 is checkpoint 1, column 1 is checkpoint 2, and column 2 is checkpoint 3.",
        },
        {
          title: "Reading A Choice",
          body:
            "A 1 means that route is selected for that checkpoint. A 0 means that route is not selected. For this level, each checkpoint column should have one selected route.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not use int[][] here. That is a jagged array. This level practices rectangular int[,] arrays, where every row and column belongs to one fixed grid.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Kai",
          lines: [
            {
              text: "The forest has three paths at every turn. Upper, middle, lower... then it repeats.",
              tone: "normal",
            },
            {
              text: "I can scan the trail from left to right, then turn what I see into rows and columns.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "I need a 3x3 int[,] named pathMap. Each 1 chooses the safe branch for that checkpoint.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "exactInteger2DArray",
      variableName: "pathMap",
      expectedRows: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      unexpectedVariableMessage:
        'Unexpected array. Only "pathMap" is allowed in Arrays Level 6.',
      successMessage: "Code accepted. Restoring the safe route...",
    },
    validateCode: createExactInteger2DArrayDeclarationValidator({
      variableName: "pathMap",
      expectedRows: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      unexpectedVariableMessage:
        'Unexpected array. Only "pathMap" is allowed in Arrays Level 6.',
      successMessage: "Code accepted. Restoring the safe route...",
    }),
  },
  12: {
    levelNumber: 12,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Mga Pangalan ng Kapre",
    subtitle: "Arrays 7 - Array Traversal",
    chapterLabel: "Arrays 7: Kapre's Name Tags",
    scene: ArraysLevelSevenScene,
    sceneKey: "ArraysLevelSevenScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-7`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void CheckName(string name) {\n      // The game checks one sign for the cursed name.\n    }\n\n    static void Main(string[] args) {\n      // Declare names, then search every sign with a for loop.\n    }\n  }\n}",
    hint:
      "The cursed name could be on any sign. Use a for loop from i = 0 while i < names.Length, then call CheckName(names[i]).",
    idleResultMessage: "Search every sign for the cursed name, then click Run.",
    successResultMessage: "Traversal complete: every names[i] was checked. The Kapre lets Kai pass.",
    errorResultMessage:
      "Traversal failed. The curse remains because not every sign was checked with CheckName(names[i]).",
    goal: {
      title: "Goal",
      description:
        "Find the cursed name by declaring the names array, then using a for loop to check every sign from index 0 to names.Length - 1.",
    },
    instruction: {
      title: "Instruction",
      items: [
        'Declare exactly one string array named names.',
        'Use these values in order: "Lina", "Tomas", "Mira", "Niko".',
        "Write a for loop with int i = 0.",
        "Keep looping while i < names.Length.",
        "Increment with i++.",
        "Inside the loop, call CheckName(names[i]);",
        "Do not skip any sign; the cursed name can be hidden at any index.",
      ],
    },
    lessonCard: {
      title: "Array Traversal",
      description:
        "Traversal means visiting each item in a collection one at a time. In this level, every sign must be checked because the cursed name could be stored at any array index.",
      sections: [
        {
          title: "Problem",
          body:
            "Four signs hang near the Kapre tree. One of their names is cursed, but Kai does not know which one until the program checks every sign.",
        },
        {
          title: "General Idea",
          body:
            "An array stores ordered values. Traversal walks through that order so a program can inspect, display, count, change, or validate every item.",
        },
        {
          title: "Loop Shape",
          body:
            "Start the index at 0 because arrays start counting at 0. Continue while the index is less than Length. Increment after each pass.",
          code:
            "for (int i = 0; i < names.Length; i++) {\n  CheckName(names[i]);\n}",
        },
        {
          title: "Why Length",
          body:
            "names.Length gives the number of items in the array. Using Length keeps the loop tied to the array size instead of a hardcoded final number.",
        },
        {
          title: "Reading The Current Item",
          body:
            "names[i] means 'the current name at index i.' As i changes from 0 to 1 to 2 to 3, the loop reads each tag in order.",
        },
        {
          title: "What The Code Does",
          body:
            "Each loop pass sends one array value into CheckName. When i is 0, the game checks names[0]. When i is 1, it checks names[1], and it keeps going until every sign has been tested.",
        },
        {
          title: "Why Check Every Item",
          body:
            "If the loop stops early or skips an index, one sign is never tested. The program cannot prove the cursed name was found unless every array item is visited.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not write i <= names.Length. The last valid index is names.Length - 1, so <= tries to go one step too far.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Kai",
          lines: [
            {
              text: "The Kapre hid a cursed name among these signs. I do not know which sign holds it.",
              tone: "normal",
            },
            {
              text: "If I skip even one sign, the curse could stay hidden and the path will remain blocked.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "I should store the sign names in order, then let a for loop search them one by one.",
              tone: "normal",
            },
            {
              text: "I need CheckName(names[i]) inside the loop, so every possible hiding place is checked.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "stringArrayTraversal",
      arrayName: "names",
      expectedValues: ["Lina", "Tomas", "Mira", "Niko"],
      methodName: "CheckName",
      unexpectedVariableMessage:
        'Unexpected array. Only "names" is allowed in Arrays Level 7.',
      successMessage: "Code accepted. Checking every hanging name...",
    },
    validateCode: createStringArrayTraversalValidator({
      arrayName: "names",
      expectedValues: ["Lina", "Tomas", "Mira", "Niko"],
      methodName: "CheckName",
      unexpectedVariableMessage:
        'Unexpected array. Only "names" is allowed in Arrays Level 7.',
      successMessage: "Code accepted. Checking every hanging name...",
    }),
  },
  13: {
    levelNumber: 13,
    lessonKey: ARRAYS_LESSON_KEY,
    parTimeSeconds: 1200,
    title: "Ang Mga Sinumpang Banga",
    subtitle: "Arrays 8 - Scanning With Traversal",
    chapterLabel: "Arrays 8: The Cursed Jars",
    scene: ArraysLevelEightScene,
    sceneKey: "ArraysLevelEightScene",
    progressKey: `${ARRAYS_LESSON_KEY}-level-8`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void ScanJar(string color) {\n      // The shrine reveals whether this jar is cursed.\n    }\n\n    static void Main(string[] args) {\n      // Declare the jar colors, then scan every jar.\n    }\n  }\n}",
    hint:
      'Store "blue", "green", "purple", and "orange" in jars, then call ScanJar(jars[i]) inside a complete for loop.',
    idleResultMessage: "Declare the jar colors and scan every sealed jar.",
    successResultMessage:
      "Scan complete: 3 safe jars collected. The cursed jar remains sealed.",
    errorResultMessage:
      "SCAN INCOMPLETE: traverse every jars[i] value with ScanJar.",
    goal: {
      title: "Goal",
      description:
        "Store the visible jar colors in an array, then scan every jar to reveal which hidden seal is cursed.",
    },
    instruction: {
      title: "Instruction",
      items: [
        'Declare string[] jars = { "blue", "green", "purple", "orange" };',
        "Write a for loop beginning with int i = 0.",
        "Continue while i < jars.Length.",
        "Increment the index with i++.",
        "Inside the loop, call ScanJar(jars[i]);",
        "The colors identify the jars, but they do not reveal the hidden curse.",
      ],
    },
    lessonCard: {
      title: "Scanning An Array",
      description:
        "An array can store visible identifiers while hidden properties are discovered only when each item is processed.",
      sections: [
        {
          title: "The Problem",
          body:
            "Four colored jars hold captured guardian spirits. Their colors are visible, but the curse is hidden inside one seal. Kai cannot know which jar is cursed until the shrine scans each one.",
        },
        {
          title: "Observable Data",
          body:
            "The jars array stores only what Kai already knows: blue, green, purple, and orange. It does not contain the answer to the mystery.",
        },
        {
          title: "Scan Every Item",
          body:
            "The loop passes each color to ScanJar. Clean jars glow briefly. When the hidden cursed jar is reached, its dark aura appears.",
          code:
            "for (int i = 0; i < jars.Length; i++) {\n  ScanJar(jars[i]);\n}",
        },
        {
          title: "Why Traverse All Jars",
          body:
            "A hidden property cannot be inferred from position or color. Skipping an index could leave the cursed spirit undiscovered.",
        },
        {
          title: "General Use",
          body:
            "Programs often store identifiers in arrays, then process each identifier to retrieve, validate, scan, or update information kept elsewhere.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Kai",
          lines: [
            {
              text: "These colored jars hold the village's captured guardian spirits, but one hidden seal is cursed.",
              tone: "normal",
            },
            {
              text: "Their colors identify them, but color alone cannot tell me which spirit was corrupted.",
              tone: "accent",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "I should store the colors in order, then let the shrine scan every jar one by one.",
              tone: "normal",
            },
            {
              text: "If I call ScanJar(jars[i]) for every index, the cursed seal will reveal its aura.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "stringArrayTraversal",
      arrayName: "jars",
      expectedValues: ["blue", "green", "purple", "orange"],
      methodName: "ScanJar",
      successMessage: "Code accepted. Inspecting every jar seal...",
    },
    validateCode: createStringArrayTraversalValidator({
      arrayName: "jars",
      expectedValues: ["blue", "green", "purple", "orange"],
      methodName: "ScanJar",
      successMessage: "Code accepted. Inspecting every jar seal...",
    }),
  },
  14: {
    levelNumber: 14,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Ang Unang Ritwal",
    subtitle: "Methods 1 - The First Ritual",
    chapterLabel: "Methods 1: The First Ritual",
    scene: MethodsLevelOneScene,
    sceneKey: "MethodsLevelOneScene",
    progressKey: `${METHODS_LESSON_KEY}-level-1`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the ritual method here.\n\n    static void Main(string[] args) {\n      // Call the ritual method here.\n    }\n  }\n}",
    hint:
      "Define static void StartRitual(), then call StartRitual(); inside Main.",
    idleResultMessage: "Define and call StartRitual.",
    successResultMessage:
      "StartRitual was defined, then Main called it. The shrine opens.",
    errorResultMessage:
      "RITUAL INCOMPLETE: define StartRitual, then call it inside Main.",
    goal: {
      title: "Goal",
      description:
        "Create one reusable method named StartRitual, then call it from Main to open the shrine path.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static void StartRitual()** in the Program class.",
        "The method does **not need parameters**.",
        "The method does **not return a value**.",
        "The method body can stay **empty** in this first method level.",
        "Inside **Main**, call **StartRitual();**",
        "Defining a method **names** the action. Calling it **runs** the action.",
      ],
    },
    lessonCard: {
      title: "Introduction To Methods",
      description:
        "A method is a named block of code. You define it once, then call it whenever you want that action to run.",
      sections: [
        {
          title: "The Problem",
          body:
            "The shrine ritual is a complete action. Instead of writing the action directly in Main, Kai gives it a name: StartRitual.",
        },
        {
          title: "Define The Method",
          body:
            "A void method performs an action and does not send back a value. The empty parentheses mean this method does not need extra information yet. For this first method level, the body can be empty because the goal is to practice defining and calling the method.",
          code:
            "static void StartRitual() {\n}",
        },
        {
          title: "Why The Body Is Empty",
          body:
            "Later methods can contain statements, calculations, parameters, or return values. Here, the game only needs to see that StartRitual exists and that Main calls it.",
        },
        {
          title: "Call The Method",
          body:
            "A method definition only describes the action. The action happens when Main calls the method by writing its name followed by parentheses.",
          code:
            "static void Main(string[] args) {\n  StartRitual();\n}",
        },
        {
          title: "General Use",
          body:
            "Methods help programs organize actions like opening a door, saving data, calculating a score, or showing a message. A good method name explains what the action does.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "portrait_player_main.png",
      portraitAlt: "Kai portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "The shrine path is sealed. It will not open from a wish or a random line of code.",
              tone: "normal",
            },
            {
              text: "This ritual must be given a name first: StartRitual.",
              tone: "accent",
            },
            {
              text: "But naming the ritual is not enough. Main must call StartRitual(); to begin it.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          lines: [
            {
              text: "So I define the method to describe the ritual, then call it from Main to make it run.",
              tone: "normal",
            },
            {
              text: "Define the action, call the action, open the shrine.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "voidMethodDefinitionCall",
      methodName: "StartRitual",
      successMessage: "Code accepted. Starting the ritual...",
    },
    validateCode: createVoidMethodDefinitionCallValidator({
      methodName: "StartRitual",
      successMessage: "Code accepted. Starting the ritual...",
    }),
  },
  15: {
    levelNumber: 15,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Kampana ng Bukang-liwayway",
    subtitle: "Methods 2 - Bell of Dawn",
    chapterLabel: "Methods 2: Bell of Dawn",
    scene: MethodsBellOfDawnScene,
    sceneKey: "MethodsBellOfDawnScene",
    progressKey: `${METHODS_LESSON_KEY}-level-2`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void RingBell() {\n      // The game rings the Bell of Dawn.\n    }\n\n    static void Main(string[] args) {\n      // Call the bell method here.\n    }\n  }\n}",
    hint:
      "RingBell() is already defined. Your job is to call RingBell(); inside Main so the prepared bell action actually runs.",
    idleResultMessage: "Call RingBell(); inside Main.",
    successResultMessage:
      "RingBell was called. The Bell of Dawn rings and the ghosts fade.",
    errorResultMessage:
      "BELL SILENT: RingBell() is predefined, but the bell will not ring unless Main calls RingBell(); exactly once.",
    goal: {
      title: "Goal",
      description:
        "Call the predefined method RingBell() from Main so the Bell of Dawn can push back the ghosts blocking the road.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "**Do not create a new method** for this level.",
        "Use the predefined **static void RingBell()** method.",
        "Inside **Main**, call **RingBell();** to run the prepared bell action.",
        "A method only performs its action when it is **called**.",
        "Use exactly **one** call to RingBell().",
      ],
    },
    lessonCard: {
      title: "Calling A Predefined Method",
      description:
        "A predefined method already exists. Your task is to call it from Main so its prepared action runs.",
      sections: [
        {
          title: "The Problem",
          body:
            "Ghosts block the road. The Bell of Dawn already knows how to ring, but the prepared action stays silent until Main calls RingBell().",
        },
        {
          title: "Predefined Means Ready",
          body:
            "RingBell already has its action. You do not need to define it again; you only need to call it from Main.",
          code:
            "static void RingBell() {\n  // The game rings the Bell of Dawn.\n}",
        },
        {
          title: "Call The Method",
          body:
            "A method call is the method name followed by parentheses and a semicolon. This tells the program to run that named action right now.",
          code:
            "static void Main(string[] args) {\n  RingBell();\n}",
        },
        {
          title: "Why This Matters",
          body:
            "Many games and programs provide methods for you. Learning to call an existing method is the first step before writing your own larger actions.",
        },
        {
          title: "Common Mistake",
          body:
            "Writing RingBell without parentheses does not call the method. Defining another RingBell method also misses the goal. Use RingBell(); inside Main.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "Ghosts are holding the road in silence. The Bell of Dawn can break their grip.",
              tone: "normal",
            },
            {
              text: "The bell ritual is already prepared as RingBell(), but prepared code stays quiet until it is called.",
              tone: "accent",
            },
            {
              text: "Call RingBell(); inside Main and let the sound push them back.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "So I do not define the bell again. I just call the method that already exists.",
              tone: "normal",
            },
            {
              text: "Main will call RingBell(); and the road should clear.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "predefinedVoidMethodCall",
      methodName: "RingBell",
      successMessage: "Code accepted. Ringing the Bell of Dawn...",
    },
    validateCode: createPredefinedVoidMethodCallValidator({
      methodName: "RingBell",
      successMessage: "Code accepted. Ringing the Bell of Dawn...",
    }),
  },
  16: {
    levelNumber: 16,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Sindihan ang Bantay-Apoy",
    subtitle: "Methods 3 - No Parameters, No Return",
    chapterLabel: "Methods 3: Light the Warding Flame",
    scene: MethodsLevelTwoScene,
    sceneKey: "MethodsLevelTwoScene",
    progressKey: `${METHODS_LESSON_KEY}-level-3`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the flame method here.\n\n    static void Main(string[] args) {\n      // Call the flame method here.\n    }\n  }\n}",
    hint:
      "Define static void LightFlame(), then call LightFlame(); inside Main. No parameters and no return value are needed.",
    idleResultMessage: "Define and call LightFlame.",
    successResultMessage:
      "LightFlame was defined and called. The warding flame burns away the barrier.",
    errorResultMessage:
      "FLAME STILL DARK: define static void LightFlame(), then call LightFlame(); inside Main.",
    goal: {
      title: "Goal",
      description:
        "Define and call a no-parameter void method named LightFlame so the fixed warding flame burns away the shadow barrier.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static void LightFlame()** in the Program class.",
        "Keep the parentheses **empty**: this method needs **no parameters**.",
        "Keep the return type **void**: this method gives **no return value**.",
        "Inside **Main**, call **LightFlame();**",
        "The method body can stay **empty** for this beginner method lesson.",
      ],
    },
    lessonCard: {
      title: "No Parameters, No Return Value",
      description:
        "A no-parameter void method performs one fixed action. It does not receive input and it does not send a value back.",
      sections: [
        {
          title: "The Problem",
          body:
            "A fixed warding flame must be lit. It does not need a number, word, or item from Kai. The method only needs to be defined and called.",
        },
        {
          title: "Define The Fixed Action",
          body:
            "LightFlame uses empty parentheses because nothing is passed into it. The return type is void because nothing is returned.",
          code:
            "static void LightFlame() {\n}",
        },
        {
          title: "Call The Method",
          body:
            "Defining the method gives the ritual a name. Calling it from Main starts the action.",
          code:
            "static void Main(string[] args) {\n  LightFlame();\n}",
        },
        {
          title: "Why No Input?",
          body:
            "There is only one flame and only one result: light it. Later methods will receive parameters when they need choices or values.",
        },
        {
          title: "Common Mistake",
          body:
            "LightFlame does not need anything inside its parentheses. Do not write LightFlame(1), LightFlame(\"apoy\"), or return a value.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "This warding flame has one fixed duty: burn away the shadow gate.",
              tone: "normal",
            },
            {
              text: "It needs no offering and gives no answer back. It only needs a named action.",
              tone: "accent",
            },
            {
              text: "Define LightFlame(), then call LightFlame(); from Main.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "So the empty parentheses mean the method receives no input.",
              tone: "normal",
            },
            {
              text: "I only need to define LightFlame and call it once.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "voidMethodDefinitionCall",
      methodName: "LightFlame",
      successMessage: "Code accepted. Lighting the warding flame...",
    },
    validateCode: createVoidMethodDefinitionCallValidator({
      methodName: "LightFlame",
      successMessage: "Code accepted. Lighting the warding flame...",
    }),
  },
  17: {
    levelNumber: 17,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Selyo ng Sinumpang Dambana",
    subtitle: "Methods 4 - Seal the Cursed Shrine",
    chapterLabel: "Methods 4: Seal the Cursed Shrine",
    scene: MethodsSealCursedShrineScene,
    sceneKey: "MethodsSealCursedShrineScene",
    progressKey: `${METHODS_LESSON_KEY}-level-4`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the shrine-sealing method here.\n\n    static void Main(string[] args) {\n      // Call the shrine-sealing method here.\n    }\n  }\n}",
    hint:
      "Define static void SealShrine(), then call SealShrine(); inside Main. The method needs no parameters and returns nothing.",
    idleResultMessage: "Define and call SealShrine.",
    successResultMessage:
      "SealShrine was defined and called. The cursed shrine seals and the creature retreats.",
    errorResultMessage:
      "SHRINE STILL CURSED: define static void SealShrine(), then call SealShrine(); inside Main.",
    goal: {
      title: "Goal",
      description:
        "Define and call a no-parameter void method named SealShrine so the cursed shrine breach seals before the manananggal gets through.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static void SealShrine()** in the Program class.",
        "Keep the parentheses **empty** because the seal needs **no parameters**.",
        "Keep the return type **void** because the seal gives **no return value**.",
        "Inside **Main**, call **SealShrine();**",
        "Use exactly **one** SealShrine method and call it once.",
      ],
    },
    lessonCard: {
      title: "Another Fixed Method",
      description:
        "A no-parameter void method can represent any fixed action: lighting a flame, sealing a shrine, opening a path, or playing a sound.",
      sections: [
        {
          title: "The Problem",
          body:
            "A manananggal circles above a cursed shrine breach. The sealing ritual does not need a number, word, or item. It only needs one named action to run.",
        },
        {
          title: "Define The Action",
          body:
            "SealShrine has empty parentheses because nothing is passed into it. It uses void because it performs the seal without returning a value.",
          code:
            "static void SealShrine() {\n}",
        },
        {
          title: "Call From Main",
          body:
            "Defining SealShrine gives the action a name. Calling SealShrine(); from Main performs the action.",
          code:
            "static void Main(string[] args) {\n  SealShrine();\n}",
        },
        {
          title: "Define Does Not Run",
          body:
            "Defining a method does not run it. A method runs only when another part of the program calls it.",
        },
        {
          title: "Why This Is Still Useful",
          body:
            "Even without parameters or return values, methods keep actions organized. The name SealShrine explains the fixed sealing action.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not write SealShrine(1), return a value, or only define the method without calling it. The shrine seals only when Main calls SealShrine();.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "This shrine is cursed. Its cracked stone is holding a breach open, and a manananggal circles above it.",
              tone: "normal",
            },
            {
              text: "This ritual has one fixed action: seal the shrine breach shut.",
              tone: "accent",
            },
            {
              text: "The shrine already knows what to do. It only waits for Main to call the named ritual.",
              tone: "normal",
            },
            {
              text: "Define SealShrine(), then call SealShrine(); from Main.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "No number, no offering, no returned answer. Just one named action.",
              tone: "normal",
            },
            {
              text: "If Main calls SealShrine();, the shrine should seal.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "voidMethodDefinitionCall",
      methodName: "SealShrine",
      successMessage: "Code accepted. Sealing the cursed shrine...",
    },
    validateCode: createVoidMethodDefinitionCallValidator({
      methodName: "SealShrine",
      successMessage: "Code accepted. Sealing the cursed shrine...",
    }),
  },
  18: {
    levelNumber: 18,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Bato ng Orakulo",
    subtitle: "Methods 5 - Oracle Stone",
    chapterLabel: "Methods 5: Oracle Stone",
    scene: MethodsOracleStoneScene,
    sceneKey: "MethodsOracleStoneScene",
    progressKey: `${METHODS_LESSON_KEY}-level-5`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the code-returning method here.\n\n    static void Main(string[] args) {\n      // Store the returned code here.\n    }\n  }\n}",
    hint:
      "Count the oracle lights, define static int GetCode() that returns that number, then store it with int code = GetCode(); inside Main.",
    idleResultMessage: "Return the oracle code, then store it in Main.",
    successResultMessage:
      "GetCode returned the oracle code. Main stored it, and the sealed path opened.",
    errorResultMessage:
      "ORACLE SILENT: GetCode must return the counted number, and Main must store GetCode() in code.",
    goal: {
      title: "Goal",
      description:
        "Define a no-parameter method named GetCode that returns the oracle stone's counted code, then store that returned value in Main.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static int GetCode()** in the Program class.",
        "Inside GetCode, use **return** to send back the number shown by the oracle lights.",
        "Do **not** use void: this method must return an **int**.",
        "Inside **Main**, store the returned value with **int code = GetCode();**",
      ],
    },
    lessonCard: {
      title: "Methods With Return Values",
      description:
        "A method can send a value back to the code that called it. That returned value can then be stored in a variable.",
      sections: [
        {
          title: "The Problem",
          body:
            "The oracle stone shows its code as a set of glowing marks. Kai must ask a method for that code, then Main must keep the answer in a variable.",
        },
        {
          title: "Return Type",
          body:
            "The word before the method name tells C# what kind of value comes back. static int GetCode() means GetCode returns an integer.",
          code:
            "static int GetCode() {\n  return 7;\n}",
        },
        {
          title: "Return Statement",
          body:
            "return ends the method and sends one value back to the caller. In this level, the value comes from counting the oracle lights in the scene.",
        },
        {
          title: "Store The Answer",
          body:
            "A returned value is useful when another part of the program stores or uses it. Main calls GetCode() and saves the answer in code.",
          code:
            "static void Main(string[] args) {\n  int code = GetCode();\n}",
        },
        {
          title: "Common Mistake",
          body:
            "Do not write static void GetCode(), because void means no value comes back. Also avoid int code = 7; here; the lesson is about receiving the value from the method call.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "This oracle stone does not open for a silent action. It gives an answer back.",
              tone: "normal",
            },
            {
              text: "Count the glowing marks around the crystal. That count is the code the method must return.",
              tone: "accent",
            },
            {
              text: "Define GetCode() so it returns the counted number, then let Main store the answer in code.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "So GetCode() is not just doing an action. It sends an int back.",
              tone: "normal",
            },
            {
              text: "Main should receive that answer with int code = GetCode();",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "intReturnMethod",
      methodName: "GetCode",
      returnValue: 7,
      variableName: "code",
      successMessage: "Code accepted. Reading the oracle stone...",
    },
    validateCode: createIntReturnMethodValidator({
      methodName: "GetCode",
      returnValue: 7,
      variableName: "code",
      successMessage: "Code accepted. Reading the oracle stone...",
    }),
  },
  19: {
    levelNumber: 19,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Ligtas na Landas ng Diwata",
    subtitle: "Methods 6 - Diwata's Safe Path",
    chapterLabel: "Methods 6: Diwata's Safe Path",
    scene: MethodsDiwatasSafePathScene,
    sceneKey: "MethodsDiwatasSafePathScene",
    progressKey: `${METHODS_LESSON_KEY}-level-6`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the safe-path method here.\n\n    static void Main(string[] args) {\n      // Store the returned path here.\n    }\n  }\n}",
    hint:
      'Define static string GetSafePath() that returns "up", then store it with string path = GetSafePath(); inside Main.',
    idleResultMessage: "Return the safe path, then store it in Main.",
    successResultMessage:
      'GetSafePath returned "up". Main stored it, and Kai crossed the safe path.',
    errorResultMessage:
      'PATH UNSAFE: GetSafePath must return "up", and Main must store GetSafePath() in path.',
    goal: {
      title: "Goal",
      description:
        "Define a no-parameter method named GetSafePath that returns the safe route as text, then store the returned path in Main.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static string GetSafePath()** in the Program class.",
        'Inside GetSafePath, use **return "up";**',
        "Do **not** use void: this method must return a **string**.",
        "Inside **Main**, store the returned value with **string path = GetSafePath();**",
      ],
    },
    lessonCard: {
      title: "Returning Text From A Method",
      description:
        "A method can return text, not just numbers. The returned string can control which route the program chooses.",
      sections: [
        {
          title: "The Problem",
          body:
            "The lower path is flooded and dangerous. The diwata's method must send back the safe route, then Main stores that answer.",
        },
        {
          title: "Return A String",
          body:
            "static string GetSafePath() means the method returns text. A string value is written inside double quotes.",
          code:
            'static string GetSafePath() {\n  return "up";\n}',
        },
        {
          title: "Store The Returned Path",
          body:
            "Main calls GetSafePath() and stores the returned word in path. The scene uses that stored word to guide Kai.",
          code:
            "static void Main(string[] args) {\n  string path = GetSafePath();\n}",
        },
        {
          title: "Common Mistake",
          body:
            'Do not write static void GetSafePath(), because void returns nothing. Also avoid string path = "up"; here; the lesson is about receiving the value from the method call.',
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "The lower path is waterlogged. It looks calm, but it pulls travelers away.",
              tone: "normal",
            },
            {
              text: "Ask GetSafePath() for the safe route. This time the answer is text.",
              tone: "accent",
            },
            {
              text: 'Return "up", then let Main store the returned path.',
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "So the method sends back a string, and Main keeps it in path.",
              tone: "normal",
            },
            {
              text: "Then the scene can choose the upper route.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "stringReturnMethod",
      methodName: "GetSafePath",
      returnValue: "up",
      variableName: "path",
      successMessage: "Code accepted. Choosing the safe path...",
    },
    validateCode: createStringReturnMethodValidator({
      methodName: "GetSafePath",
      returnValue: "up",
      variableName: "path",
      successMessage: "Code accepted. Choosing the safe path...",
    }),
  },
  20: {
    levelNumber: 20,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Handog sa Dambana",
    subtitle: "Methods 7 - Shrine Offering",
    chapterLabel: "Methods 7: Shrine Offering",
    scene: MethodsShrineOfferingScene,
    sceneKey: "MethodsShrineOfferingScene",
    progressKey: `${METHODS_LESSON_KEY}-level-7`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void PlaceOffering(string item) {\n      // The game places the offering named by item.\n    }\n\n    static void Main(string[] args) {\n      // Pass the correct offering here.\n    }\n  }\n}",
    hint:
      'PlaceOffering already exists and needs one string parameter. Call PlaceOffering("rice"); inside Main.',
    idleResultMessage: "Pass the correct offering to the shrine.",
    successResultMessage:
      'PlaceOffering received "rice". The offering appears, and the path opens.',
    errorResultMessage:
      'OFFERING REJECTED: call PlaceOffering("rice"); inside Main.',
    goal: {
      title: "Goal",
      description:
        'Call the predefined method PlaceOffering with the string "rice" so the shrine receives the exact offering it asks for.',
    },
    instruction: {
      title: "Instruction",
      items: [
        "**Do not create a new method** for this level.",
        "Use the predefined **static void PlaceOffering(string item)** method.",
        'Inside **Main**, call **PlaceOffering("rice");**',
        "The word inside the parentheses is the **argument** passed into the method.",
        "Because the method is **void**, it performs an action but does **not** return a value.",
      ],
    },
    lessonCard: {
      title: "Methods With Parameters",
      description:
        "A parameter lets a method receive a value. The method can use that value to decide what action to perform.",
      sections: [
        {
          title: "The Problem",
          body:
            'The shrine is ready, but it does not accept just any action. It needs the exact offering: "rice". That value must be passed into PlaceOffering.',
        },
        {
          title: "Parameter In The Method",
          body:
            "The method header says it receives a string named item. That means the caller must provide text when calling the method.",
          code:
            "static void PlaceOffering(string item) {\n  // The game places the offering named by item.\n}",
        },
        {
          title: "Argument In The Call",
          body:
            'The value "rice" is the argument. It travels into the item parameter when Main calls PlaceOffering.',
          code:
            'static void Main(string[] args) {\n  PlaceOffering("rice");\n}',
        },
        {
          title: "No Return Value",
          body:
            "PlaceOffering is void, so it does not send a value back. It simply uses the argument to perform the shrine action.",
        },
        {
          title: "Common Mistake",
          body:
            'PlaceOffering(); is missing the offering. PlaceOffering("stone"); passes the wrong offering. Use the exact string "rice".',
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "This roadside shrine opens the path only when it receives the right handog.",
              tone: "normal",
            },
            {
              text: "The method is already prepared: PlaceOffering(string item). It waits for the item you pass.",
              tone: "accent",
            },
            {
              text: 'Pass "rice" into PlaceOffering so the shrine knows what Kai is offering.',
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "So the method name is the action, and the string inside the parentheses is the offering.",
              tone: "normal",
            },
            {
              text: 'I need Main to call PlaceOffering("rice");',
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "voidMethodParameterCall",
      methodName: "PlaceOffering",
      parameterType: "string",
      parameterName: "item",
      expectedArgument: '"rice"',
      wrongArgumentMessage: 'The shrine asks for rice. Call PlaceOffering("rice");',
      successMessage: "Code accepted. Placing the shrine offering...",
    },
    validateCode: createVoidMethodParameterCallValidator({
      methodName: "PlaceOffering",
      parameterType: "string",
      parameterName: "item",
      expectedArgument: '"rice"',
      wrongArgumentMessage: 'The shrine asks for rice. Call PlaceOffering("rice");',
      successMessage: "Code accepted. Placing the shrine offering...",
    }),
  },
  21: {
    levelNumber: 21,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Asin Laban sa Aswang",
    subtitle: "Methods 8 - Salt Against the Aswang",
    chapterLabel: "Methods 8: Salt Against the Aswang",
    scene: MethodsSaltAgainstAswangScene,
    sceneKey: "MethodsSaltAgainstAswangScene",
    progressKey: `${METHODS_LESSON_KEY}-level-8`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void ThrowSalt(int amount) {\n      // The game throws a measured amount of salt.\n    }\n\n    static void Main(string[] args) {\n      // Pass the salt amount here.\n    }\n  }\n}",
    hint:
      "ThrowSalt already exists and needs one integer parameter. Count the distance markers, then call ThrowSalt(5); inside Main.",
    idleResultMessage: "Pass the measured salt amount.",
    successResultMessage:
      "ThrowSalt received 5. The salt reaches the aswang and clears the path.",
    errorResultMessage:
      "SALT MISSED: count the target marker, then call ThrowSalt(5); inside Main.",
    goal: {
      title: "Goal",
      description:
        "Call the predefined method ThrowSalt with the integer 5 so Kai throws the right measured amount of salt.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "**Do not create a new method** for this level.",
        "Use the predefined **static void ThrowSalt(int amount)** method.",
        "Use the numbered distance markers to find the aswang's position.",
        "Inside **Main**, call **ThrowSalt(5);**",
        "The number inside the parentheses is the **argument** passed into the method.",
        "Because the method is **void**, it performs the throw but does **not** return a value.",
      ],
    },
    lessonCard: {
      title: "Numeric Parameters",
      description:
        "A parameter can receive a number. The method uses that number to control how strong or far an action should be.",
      sections: [
        {
          title: "The Problem",
          body:
            "The aswang is blocking the path at marker 5. Too little salt falls short, and too much misses. The method needs the exact measured amount.",
        },
        {
          title: "Parameter In The Method",
          body:
            "ThrowSalt has an int parameter named amount. That means the call must pass a whole number.",
          code:
            "static void ThrowSalt(int amount) {\n  // The game throws a measured amount of salt.\n}",
        },
        {
          title: "Argument In The Call",
          body:
            "The argument 5 travels into the amount parameter. The game uses that value to make the salt reach the aswang.",
          code:
            "static void Main(string[] args) {\n  ThrowSalt(5);\n}",
        },
        {
          title: "Common Mistake",
          body:
            'ThrowSalt(); is missing the amount. ThrowSalt("5"); is text, not an integer. ThrowSalt(2); is too weak.',
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "The aswang is close. A careless throw will not push it back.",
              tone: "normal",
            },
            {
              text: "ThrowSalt(int amount) is ready. The number you pass controls the strength of the salt.",
              tone: "accent",
            },
            {
              text: "Salt works only when measured. Count the reach before you throw.",
              tone: "normal",
            },
            {
              text: "Count the markers. The aswang stands at 5.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "So the method already knows how to throw. I only choose the amount.",
              tone: "normal",
            },
            {
              text: "Main should call ThrowSalt(5);",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "predefinedVoidMethodArgument",
      methodName: "ThrowSalt",
      expectedArgument: "5",
      wrongArgumentMessage: "The aswang is at marker 5. Call ThrowSalt(5);",
      successMessage: "Code accepted. Throwing measured salt...",
    },
    validateCode: createPredefinedVoidMethodArgumentValidator({
      methodName: "ThrowSalt",
      expectedArgument: "5",
      wrongArgumentMessage: "The aswang is at marker 5. Call ThrowSalt(5);",
      successMessage: "Code accepted. Throwing measured salt...",
    }),
  },
  22: {
    levelNumber: 22,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Lakas ng Anting-Anting",
    subtitle: "Methods 9 - Anting-Anting Power",
    chapterLabel: "Methods 9: Anting-Anting Power",
    scene: MethodsAntingAntingPowerScene,
    sceneKey: "MethodsAntingAntingPowerScene",
    progressKey: `${METHODS_LESSON_KEY}-level-9`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the power method here.\n\n    static void Main(string[] args) {\n      // Store the returned power here.\n    }\n  }\n}",
    hint:
      "Define static int CalculatePower(int basePower, int bonus), return basePower + bonus, then store CalculatePower(5, 3) in power.",
    idleResultMessage: "Calculate and store the anting-anting power.",
    successResultMessage:
      "CalculatePower returned 8. The anting-anting shield blocks the shadow.",
    errorResultMessage:
      "POWER UNSTABLE: define CalculatePower with two int parameters, return their sum, and store CalculatePower(5, 3).",
    goal: {
      title: "Goal",
      description:
        "Define a method named CalculatePower that receives basePower and bonus, returns their sum, then store the result in power.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static int CalculatePower(int basePower, int bonus)** in the Program class.",
        "Inside the method, write **return basePower + bonus;**",
        "Inside **Main**, write **int power = CalculatePower(5, 3);**",
        "The two numbers are **arguments**. They enter the method through the parameters.",
        "The returned value must be stored in **power**.",
      ],
    },
    lessonCard: {
      title: "Parameters And Return Values",
      description:
        "A method can receive values, calculate with them, and send one value back to the caller.",
      sections: [
        {
          title: "The Problem",
          body:
            "The anting-anting needs exactly 8 power to block the shadow. Kai must calculate that value instead of writing the final number directly.",
        },
        {
          title: "Define The Calculation",
          body:
            "The parameters basePower and bonus are placeholders for the numbers that will be passed into the method.",
          code:
            "static int CalculatePower(int basePower, int bonus) {\n  return basePower + bonus;\n}",
        },
        {
          title: "Store The Return Value",
          body:
            "The call CalculatePower(5, 3) returns 8. Main stores that returned value in power.",
          code:
            "static void Main(string[] args) {\n  int power = CalculatePower(5, 3);\n}",
        },
        {
          title: "Common Mistake",
          body:
            "Do not use void here. A shield needs a returned number, so CalculatePower must return int.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "The shadow is coming. The anting-anting will only guard Kai if its power reaches 8.",
              tone: "normal",
            },
            {
              text: "Use a method that receives base power and bonus, then returns the total.",
              tone: "accent",
            },
            {
              text: "CalculatePower(5, 3) should return the shield power.",
              tone: "goal",
            },
          ],
        },
        {
          speaker: "Kai",
          portraitImage: "portrait_player_main.png",
          portraitAlt: "Kai portrait",
          lines: [
            {
              text: "So the method does the adding, and Main stores what comes back.",
              tone: "normal",
            },
            {
              text: "I need int power = CalculatePower(5, 3);",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "intParameterReturnMethod",
      methodName: "CalculatePower",
      parameters: [
        { type: "int", name: "basePower" },
        { type: "int", name: "bonus" },
      ],
      returnExpression: "basePower + bonus",
      variableName: "power",
      expectedArguments: [5, 3],
      successMessage: "Code accepted. Charging the anting-anting...",
    },
    validateCode: createIntParameterReturnMethodValidator({
      methodName: "CalculatePower",
      parameters: [
        { type: "int", name: "basePower" },
        { type: "int", name: "bonus" },
      ],
      returnExpression: "basePower + bonus",
      variableName: "power",
      expectedArguments: [5, 3],
      successMessage: "Code accepted. Charging the anting-anting...",
    }),
  },
  23: {
    levelNumber: 23,
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Ritwal ng Paghilom",
    subtitle: "Methods 10 - Healing Ritual",
    chapterLabel: "Methods 10: Healing Ritual",
    scene: MethodsHealingRitualScene,
    sceneKey: "MethodsHealingRitualScene",
    progressKey: `${METHODS_LESSON_KEY}-level-10`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the healing method here.\n\n    static void Main(string[] args) {\n      // Store the returned healing here.\n    }\n  }\n}",
    hint:
      "Define static int Heal(int herb, int water), return herb * water, then store Heal(5, 2) in healing.",
    idleResultMessage: "Speak with the Diwata.",
    successResultMessage:
      "Heal returned 10. The diwata is restored.",
    errorResultMessage:
      "HEALING FAILED: define Heal with two int parameters, multiply them, and store Heal(5, 2).",
    goal: {
      title: "Goal",
      description:
        "Define a method named Heal that receives herb and water, returns their product, then store the result in healing.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static int Heal(int herb, int water)** in the Program class.",
        "Inside the method, write **return herb * water;**",
        "Inside **Main**, write **int healing = Heal(5, 2);**",
        "The returned value fills the Diwata's healing bar.",
        "Do not type **int healing = 10;** directly. The value must come from the method call.",
      ],
    },
    lessonCard: {
      title: "Multiplying Parameters",
      description:
        "A method can receive more than one value, use those values in a calculation, and return the result.",
      sections: [
        {
          title: "The Problem",
          body:
            "The Diwata was wounded by a shadow attack. The ritual needs herb power and water power combined by multiplication, not a typed final answer.",
        },
        {
          title: "Define The Method",
          body:
            "The parameters herb and water are input values. Inside Heal, multiply them and return the result.",
          code:
            "static int Heal(int herb, int water) {\n  return herb * water;\n}",
        },
        {
          title: "Store The Result",
          body:
            "Main calls Heal(5, 2). The method returns 10, then Main stores that returned value in healing.",
          code:
            "static void Main(string[] args) {\n  int healing = Heal(5, 2);\n}",
        },
        {
          title: "Common Mistake",
          body:
            "Do not use void here. A healing bar needs a returned number, so Heal must return int.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "Kai, you made it. The forest has been quiet, but stay close.",
              tone: "normal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "intParameterReturnMethod",
      methodName: "Heal",
      parameters: [
        { type: "int", name: "herb" },
        { type: "int", name: "water" },
      ],
      returnExpression: "herb * water",
      variableName: "healing",
      expectedArguments: [5, 2],
      expectedResult: 10,
      successMessage: "Code accepted. Restoring the Diwata...",
    },
    validateCode: createIntParameterReturnMethodValidator({
      methodName: "Heal",
      parameters: [
        { type: "int", name: "herb" },
        { type: "int", name: "water" },
      ],
      returnExpression: "herb * water",
      variableName: "healing",
      expectedArguments: [5, 2],
      expectedResult: 10,
      successMessage: "Code accepted. Restoring the Diwata...",
    }),
  },
  24: {
    levelNumber: 24,
    mapLevelLabel: "24-25",
    lessonKey: METHODS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Walang-Hanggang Hagdan ng Kawayan",
    subtitle: "Methods 11-12 - Endless Bamboo Stairs",
    chapterLabel: "Methods 11-12: Endless Bamboo Stairs",
    scene: MethodsEndlessBambooStairsScene,
    sceneKey: "MethodsEndlessBambooStairsScene",
    progressKey: `${METHODS_LESSON_KEY}-level-11`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Predefined for this lesson.\n    static void CreateStep(int step) {\n      // The game creates one bamboo stair.\n    }\n\n    // Define the recursive stair method here.\n\n    static void Main(string[] args) {\n      // Start the stair ritual here.\n    }\n  }\n}",
    hint:
      "Stop at step 0. Otherwise call BuildStairs(step - 1), then CreateStep(step). Start with BuildStairs(5).",
    idleResultMessage: "The bamboo stairs are still hidden.",
    successResultMessage:
      "The recursive calls returned in order. All five bamboo stairs are stable.",
    errorResultMessage:
      "STAIR RITUAL FAILED: check the base case, decreasing recursive call, and unwinding order.",
    goal: {
      title: "Goal",
      description:
        "Use recursion to build five bamboo stairs from the lowest step to the shrine.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static void BuildStairs(int step)** in the Program class.",
        "Add the base case **if (step == 0) return;**",
        "Call **BuildStairs(step - 1);** so each call moves toward the base case.",
        "After that call, write **CreateStep(step);** so stairs appear while recursion unwinds.",
        "Inside **Main**, call **BuildStairs(5);** exactly once.",
      ],
    },
    lessonCard: {
      title: "Recursion And The Call Stack",
      description:
        "Recursion happens when a method calls itself with a smaller problem. Every call waits on the call stack until the base case is reached.",
      sections: [
        {
          title: "The Problem",
          body:
            "The bamboo stairway is trapped in a loop. Building a step before finding the bottom makes the path unstable. The ritual must first descend from step 5 to step 0.",
        },
        {
          title: "Base Case",
          body:
            "A recursive method needs a condition that stops further calls. At step 0, return immediately.",
          code:
            "if (step == 0) return;",
        },
        {
          title: "Recursive Step",
          body:
            "Each call uses step - 1, so the problem becomes smaller and eventually reaches the base case.",
          code:
            "BuildStairs(step - 1);",
        },
        {
          title: "Unwinding",
          body:
            "Code after the recursive call runs while the call stack unwinds. CreateStep therefore receives 1, 2, 3, 4, then 5, building safely from bottom to top.",
          code:
            "static void BuildStairs(int step) {\n  if (step == 0) return;\n  BuildStairs(step - 1);\n  CreateStep(step);\n}",
        },
        {
          title: "Execution Trace",
          body:
            "The calls travel downward first. Only after step 0 returns does each waiting call create its stair.",
          code:
            "Calls:  5 -> 4 -> 3 -> 2 -> 1 -> 0\nBuilds: 1 -> 2 -> 3 -> 4 -> 5",
        },
        {
          title: "Common Mistakes",
          body:
            "Without a base case, recursion never stops. Calling BuildStairs(step) makes no progress. Placing CreateStep before the recursive call builds the stairs in reverse order.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "The bamboo stairs repeat forever because the old ritual never learned when to stop.",
              tone: "normal",
            },
            {
              text: "Guide the ritual down to step zero. When the calls return, each waiting step can rise in order.",
              tone: "danger",
            },
            {
              text: "Build five steps. The shrine is waiting above.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "recursiveStairMethod",
      methodName: "BuildStairs",
      parameterName: "step",
      actionMethodName: "CreateStep",
      expectedArgument: 5,
      successMessage: "Code accepted. Unwinding the bamboo stair ritual...",
    },
    validateCode: createRecursiveStairMethodValidator({
      methodName: "BuildStairs",
      parameterName: "step",
      actionMethodName: "CreateStep",
      expectedArgument: 5,
      successMessage: "Code accepted. Unwinding the bamboo stair ritual...",
    }),
  },
  26: {
    levelNumber: 26,
    lessonKey: FUNCTIONS_ARRAYS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Sindihan ang Hanay ng Parol",
    subtitle: "Functions With Arrays 1 - Process the Lantern Line",
    chapterLabel: "Functions With Arrays 1: Process the Lantern Line",
    scene: FunctionsArraysLanternLineScene,
    sceneKey: "FunctionsArraysLanternLineScene",
    progressKey: `${FUNCTIONS_ARRAYS_LESSON_KEY}-level-1`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define the lantern method here.\n\n    static void Main(string[] args) {\n      // Create the lantern array, then pass it to the method.\n    }\n  }\n}",
    hint:
      "The method parameter uses int[]. A signal of 1 means on and 0 means off. In Main, create lanterns with three 1 values, then pass the array name to the method.",
    idleResultMessage: "The lantern line is waiting for its array.",
    successResultMessage:
      "The array reached the method. All three lanterns are burning.",
    errorResultMessage:
      "The lantern method could not receive the array. Check its parameter, declaration, and call.",
    goal: {
      title: "Goal",
      description:
        "Group the three lantern signals in one integer array and pass that array to LightLanterns.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static void LightLanterns(int[] lanterns)** in the Program class.",
        "The method body can remain **empty for now**. This level focuses on receiving and passing an array.",
        "Inside **Main**, declare **int[] lanterns = { 1, 1, 1 };**",
        "Each **1** means on; **0** would mean off for the lantern at the same array index.",
        "Pass the whole array with **LightLanterns(lanterns);**",
        "Do not call the method once for every value. One array argument carries the complete lantern line.",
      ],
    },
    lessonCard: {
      title: "Passing Arrays To Methods",
      description:
        "An array groups related values. A method can receive the entire group through one array parameter.",
      sections: [
        {
          title: "The Problem",
          body:
            "Three ward lanterns share one ritual line. Sending separate values would repeat the same action, so Kai groups their signals into one array.",
        },
        {
          title: "Array Parameter",
          body:
            "The brackets in int[] tell C# that lanterns receives an integer array, not one integer.",
          code:
            "static void LightLanterns(int[] lanterns) {\n}",
        },
        {
          title: "Pass The Group",
          body:
            "Main creates the array once. The method call uses the array name, passing all three values together.",
          code:
            "int[] lanterns = { 1, 1, 1 };\nLightLanterns(lanterns);",
        },
        {
          title: "What Happens",
          body:
            "A value of 1 means on and 0 means off, so { 1, 1, 1 } activates all three lanterns. The method body may stay empty for now; later lessons will inspect and process the elements inside it.",
        },
        {
          title: "Common Mistake",
          body:
            "Do not write LightLanterns(1). The parameter expects int[], so the argument must be an array.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "Each lantern reads one signal from the array: 1 means on, while 0 means off.",
              tone: "normal",
            },
            {
              text: "For now, LightLanterns can have an empty body. We are practicing how a method receives an int[] array.",
              tone: "normal",
            },
            {
              text: "Create { 1, 1, 1 } in Main, then pass the whole array to LightLanterns once.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "voidMethodIntegerArrayParameter",
      methodName: "LightLanterns",
      parameterName: "lanterns",
      arrayName: "lanterns",
      expectedValues: [1, 1, 1],
      successMessage: "Code accepted. Sending the array through the lantern line...",
    },
    validateCode: createVoidMethodIntegerArrayParameterValidator({
      methodName: "LightLanterns",
      parameterName: "lanterns",
      arrayName: "lanterns",
      expectedValues: [1, 1, 1],
      successMessage: "Code accepted. Sending the array through the lantern line...",
    }),
  },
  27: {
    levelNumber: 27,
    lessonKey: FUNCTIONS_ARRAYS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Bilangin ang Sumpang Agimat",
    subtitle: "Functions With Arrays 2 - Count the Cursed Charms",
    chapterLabel: "Functions With Arrays 2: Count the Cursed Charms",
    scene: FunctionsArraysCountCursedCharmsScene,
    sceneKey: "FunctionsArraysCountCursedCharmsScene",
    progressKey: `${FUNCTIONS_ARRAYS_LESSON_KEY}-level-2`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define CountCursed here.\n\n    static void Main(string[] args) {\n      int[] charms = { 1, 0, 1, 1, 0, 1 };\n      // Store the returned cursed count here.\n    }\n  }\n}",
    hint:
      "Start count at 0. Visit every index with a for loop. When charms[i] == 0, increment count, then return it.",
    idleResultMessage: "The charm inspection is waiting.",
    successResultMessage:
      "The method found both cursed charms. The checkpoint is clear.",
    errorResultMessage:
      "The inspection stopped. Check the method signature, loop, condition, counter, and returned value.",
    goal: {
      title: "Goal",
      description:
        "Pass the charm array into CountCursed, count every 0, and store the returned number.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static int CountCursed(int[] charms)** in the Program class.",
        "Start with **int count = 0;**",
        "Use a **for loop** from index 0 to **charms.Length - 1**.",
        "When **charms[i] == 0**, run **count++;**",
        "After the loop, write **return count;**",
        "Inside **Main**, store the result with **int cursedCount = CountCursed(charms);**",
      ],
    },
    lessonCard: {
      title: "Counting Array Values In A Method",
      description:
        "A method can receive an array, inspect every element, accumulate a result, and return that result to its caller.",
      sections: [
        {
          title: "The Problem",
          body:
            "The charms look harmless until the ritual scans them. A value of 1 means clean and 0 means cursed. Kai needs the total number of cursed charms before the checkpoint can open.",
        },
        {
          title: "Traverse The Parameter",
          body:
            "The parameter charms refers to the array passed by Main. The loop index visits each element from left to right.",
          code:
            "for (int i = 0; i < charms.Length; i++) {\n  // inspect charms[i]\n}",
        },
        {
          title: "Accumulate A Count",
          body:
            "The counter begins at zero. Each matching value adds one, preserving the total found so far.",
          code:
            "if (charms[i] == 0) {\n  count++;\n}",
        },
        {
          title: "Return The Result",
          body:
            "After the loop finishes, return sends the completed count back to Main, where cursedCount stores it.",
          code:
            "return count;\n\nint cursedCount = CountCursed(charms);",
        },
        {
          title: "Common Mistake",
          body:
            "Do not return from inside the loop. That would stop after the first inspected charm instead of checking the complete array.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "Six charms guard this checkpoint, but two carry a hidden curse.",
              tone: "danger",
            },
            {
              text: "In their array, 1 means clean and 0 means cursed. CountCursed must inspect every position.",
              tone: "normal",
            },
            {
              text: "Count each zero, return the total, and the ritual will expose the cursed charms.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "cursedCharmCountMethod",
      methodName: "CountCursed",
      parameterName: "charms",
      arrayName: "charms",
      counterName: "count",
      resultName: "cursedCount",
      expectedValues: [1, 0, 1, 1, 0, 1],
      targetValue: 0,
      successMessage: "Code accepted. Inspecting every charm...",
    },
    validateCode: createCursedCharmCountMethodValidator({
      methodName: "CountCursed",
      parameterName: "charms",
      arrayName: "charms",
      counterName: "count",
      resultName: "cursedCount",
      expectedValues: [1, 0, 1, 1, 0, 1],
      targetValue: 0,
      successMessage: "Code accepted. Inspecting every charm...",
    }),
  },
  28: {
    levelNumber: 28,
    lessonKey: FUNCTIONS_ARRAYS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Ibalik ang Warding Grid",
    subtitle: "Functions With Arrays 3 - Restore the Warding Grid",
    chapterLabel: "Functions With Arrays 3: Restore the Warding Grid",
    scene: FunctionsArraysRestoreWardingGridScene,
    sceneKey: "FunctionsArraysRestoreWardingGridScene",
    progressKey: `${FUNCTIONS_ARRAYS_LESSON_KEY}-level-3`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define RestoreGrid here.\n\n    static void Main(string[] args) {\n      // Declare the 2D warding grid, then pass it to the method.\n    }\n  }\n}",
    hint:
      "Blue runes are 1 and all other runes are 0. Read the upper row left to right, then the lower row, and pass grid to RestoreGrid once.",
    idleResultMessage: "The warding grid is unstable.",
    successResultMessage:
      "The complete 2D grid reached RestoreGrid. The shrine floor is safe.",
    errorResultMessage:
      "The grid could not be restored. Check the int[,] parameter, declaration and method call.",
    goal: {
      title: "Goal",
      description:
        "Select the blue runes with 1, mark every other rune with 0, and pass the complete 2D array into RestoreGrid.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static void RestoreGrid(int[,] grid)** in the Program class.",
        "The method body may remain **empty for now**. This level focuses on receiving a two-dimensional array.",
        "Inspect the shrine grid: encode each **blue rune as 1** and every **other rune as 0**.",
        "Inside **Main**, declare **int[,] grid**. Read the **upper row first**, from left to right, followed by the lower row.",
        "Pass the entire grid once with **RestoreGrid(grid);**",
        "Use the rectangular form **int[,]**, not the jagged form **int[][]**.",
      ],
    },
    lessonCard: {
      title: "Passing 2D Arrays To Methods",
      description:
        "A rectangular two-dimensional array can be passed through one method parameter while preserving its rows and columns.",
      sections: [
        {
          title: "The Problem",
          body:
            "Only the blue runes belong to the restored ward. Kai must translate their positions into rows and columns, then send the complete pattern to one restoration method.",
        },
        {
          title: "The 2D Parameter",
          body:
            "The comma inside int[,] tells C# that grid has two dimensions. The method receives one reference to the complete rectangular grid.",
          code: "static void RestoreGrid(int[,] grid) {\n}",
        },
        {
          title: "Create The Pattern",
          body:
            "Use 1 where a blue rune appears and 0 everywhere else. Each inner brace group is one row, read from left to right and from the upper row to the lower row.",
        },
        {
          title: "Pass The Whole Grid",
          body:
            "The call uses only the array name. One argument carries all four cells into RestoreGrid.",
          code: "RestoreGrid(grid);",
        },
        {
          title: "Rectangular And Jagged",
          body:
            "int[,] is one rectangular array with rows and columns. int[][] is an array of separate arrays and is not accepted in this lesson.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "Only the blue runes belong to this ward. Record a blue rune as 1 and every other rune as 0.",
              tone: "danger",
            },
            {
              text: "Read the upper row from left to right, then the lower row. Keep those positions in a rectangular int[,] grid.",
              tone: "normal",
            },
            {
              text: "Define RestoreGrid with an int[,] parameter, then pass the finished grid to it once.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "voidMethodInteger2DArrayParameter",
      methodName: "RestoreGrid",
      parameterName: "grid",
      arrayName: "grid",
      expectedRows: [
        [1, 0],
        [0, 1],
      ],
      mismatchMessage:
        "The selection does not match the shrine. Use 1 for blue runes and 0 for every other rune, reading each row left to right.",
      successMessage: "Code accepted. Restoring the warding grid...",
    },
    validateCode: createVoidMethodInteger2DArrayParameterValidator({
      methodName: "RestoreGrid",
      parameterName: "grid",
      arrayName: "grid",
      expectedRows: [
        [1, 0],
        [0, 1],
      ],
      mismatchMessage:
        "The selection does not match the shrine. Use 1 for blue runes and 0 for every other rune, reading each row left to right.",
      successMessage: "Code accepted. Restoring the warding grid...",
    }),
  },
  29: {
    levelNumber: 29,
    lessonKey: FUNCTIONS_ARRAYS_LESSON_KEY,
    parTimeSeconds: 900,
    title: "Sementeryo ng mga Limot na Espiritu",
    subtitle: "Functions With Arrays 4 - Ancient Cemetery",
    chapterLabel: "Functions With Arrays 4: Ancient Cemetery of the Forgotten Spirits",
    scene: FunctionsArraysAncientCemeteryScene,
    sceneKey: "FunctionsArraysAncientCemeteryScene",
    progressKey: `${FUNCTIONS_ARRAYS_LESSON_KEY}-level-4`,
    nextRoute: "/Map",
    nextDelayMs: 1200,
    startWithDialogue: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Define CountBlessedGraves here.\n\n    static void Main(string[] args) {\n      int[,] graves = {\n        { 1, 0, 1, 1 },\n        { 0, 1, 0, 1 },\n        { 1, 1, 0, 0 }\n      };\n      // Store the returned blessed-grave count here.\n    }\n  }\n}",
    hint:
      "Use GetLength(0) for rows and GetLength(1) for columns. Count a grave only when graves[row, col] == 1.",
    idleResultMessage: "The forgotten cemetery is waiting for every grave to be inspected.",
    successResultMessage:
      "All twelve graves were inspected. Seven guardian spirits returned beneath the opened moon. The forgotten are finally at peace.",
    errorResultMessage:
      "The cemetery scan stopped. Check both GetLength loops, graves[row, col], the increment and the returned count.",
    goal: {
      title: "Goal",
      description:
        "Pass the 3 by 4 cemetery grid to a method, inspect every grave, count each blessed grave marked 1, and store the returned total.",
    },
    instruction: {
      title: "Instruction",
      items: [
        "Define **static int CountBlessedGraves(int[,] graves)** in the Program class.",
        "Inside the method, begin with **int blessed = 0;**",
        "Use an outer loop with **graves.GetLength(0)** to visit every row.",
        "Inside it, use another loop with **graves.GetLength(1)** to visit every column.",
        "When **graves[row, col] == 1**, increment **blessed**.",
        "Return the count, then store it with **int blessed = CountBlessedGraves(graves);**",
      ],
    },
    lessonCard: {
      title: "Methods With 2D Arrays",
      description:
        "Learn how a C# method receives a rectangular array, traverses every element with nested for loops, accumulates a result, and returns that result to its caller.",
      sections: [
        {
          title: "Learning Objectives",
          body:
            "After this lesson, you should be able to identify rows and columns in a rectangular array, use GetLength to set safe loop bounds, traverse every element with nested for loops, count matching values, and return the count from a method.",
        },
        {
          title: "Rectangular Two-Dimensional Arrays",
          body:
            "The C# type int[,] represents one rectangular table of integers. The first index selects a row and the second selects a column. Therefore, grid[1, 2] means the value in row 1, column 2. Array indexes begin at 0.",
          code:
            "int[,] grid = {\n  { 4, 7, 2 },\n  { 9, 1, 5 }\n};\n\nint value = grid[1, 2]; // 5",
        },
        {
          title: "Why Use For Loops?",
          body:
            "A for loop repeats an operation while its loop variable changes in a predictable sequence. Arrays are indexed collections, so a for loop can use its counter as an array index. This avoids writing a separate statement for every element and still works when the array size changes.",
          code:
            "for (int index = 0; index < items.Length; index++) {\n  Console.WriteLine(items[index]);\n}",
        },
        {
          title: "Why Two Loops Are Required",
          body:
            "A two-dimensional array has two independent directions. The outer loop chooses one row. For that row, the inner loop visits every column. When the inner loop finishes, the outer loop advances to the next row. This order is called row-major traversal.",
          code:
            "for (int row = 0; row < grid.GetLength(0); row++) {\n  for (int col = 0; col < grid.GetLength(1); col++) {\n    Console.WriteLine(grid[row, col]);\n  }\n}",
        },
        {
          title: "Safe Loop Bounds With GetLength",
          body:
            "GetLength(0) returns the number of rows, while GetLength(1) returns the number of columns. The condition uses < instead of <= because the last valid index is always one less than the length. Correct bounds prevent IndexOutOfRangeException.",
          code:
            "int rows = grid.GetLength(0);\nint columns = grid.GetLength(1);",
        },
        {
          title: "The Accumulator Pattern",
          body:
            "An accumulator stores a result that develops over repeated steps. A counter begins at 0 and increases only when the current element satisfies a condition. It must be declared before the loops so its value is preserved across every iteration.",
          code:
            "int matches = 0;\n\nif (grid[row, col] == target) {\n  matches++;\n}",
        },
        {
          title: "Passing An Array To A Method",
          body:
            "A parameter allows one method to receive data from its caller. The parameter int[,] grid accepts a reference to the complete rectangular array; the method does not need twelve separate parameters. An int return type promises that the method will send one integer result back.",
          code:
            "static int CountMatches(int[,] grid) {\n  int matches = 0;\n  // Traverse and count here.\n  return matches;\n}",
        },
        {
          title: "Calling And Storing The Result",
          body:
            "Calling a method runs its body. Because this method returns an integer, Main should store the returned value in a variable. Typing the expected total directly would skip the algorithm and would fail for a different grid.",
          code: "int result = CountMatches(grid);",
        },
        {
          title: "Tracing The Algorithm",
          body:
            "For a 3 by 4 grid, the outer loop runs 3 times and the inner loop runs 4 times for each row. That produces 3 x 4 = 12 element inspections. Track row, column, current value, and the counter after each inspection to verify the algorithm.",
        },
        {
          title: "Complexity And Common Errors",
          body:
            "If a grid has R rows and C columns, complete traversal performs R x C inspections, so its time complexity is O(R x C). Common errors include using only one loop, swapping GetLength dimensions, using <= as a bound, reading grid[row] instead of grid[row, col], resetting the counter inside a loop, and forgetting to return the result.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
                text: "These graves once guarded Barangay Malumay. Now corruption has silenced many of their spirits.",
              tone: "danger",
            },
            {
                text: "They were arranged in three rows and four columns. A blessed grave is 1; a corrupted grave is 0.",
              tone: "normal",
            },
            {
                text: "Every grave must be inspected. Visit every row, visit every column, then return how many guardian spirits remain.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "blessedGraveCount2DMethod",
      methodName: "CountBlessedGraves",
      parameterName: "graves",
      arrayName: "graves",
      counterName: "blessed",
      resultName: "blessed",
      expectedRows: [
        [1, 0, 1, 1],
        [0, 1, 0, 1],
        [1, 1, 0, 0],
      ],
      targetValue: 1,
      successMessage: "Code accepted. Inspecting every grave...",
    },
    validateCode: createBlessedGraveCount2DMethodValidator({
      methodName: "CountBlessedGraves",
      parameterName: "graves",
      arrayName: "graves",
      counterName: "blessed",
      resultName: "blessed",
      expectedRows: [
        [1, 0, 1, 1],
        [0, 1, 0, 1],
        [1, 1, 0, 0],
      ],
      targetValue: 1,
      successMessage: "Code accepted. Inspecting every grave...",
    }),
  },
  30: {
    levelNumber: 30,
    lessonKey: FINAL_LESSON_KEY,
    parTimeSeconds: 1800,
    title: "Bakunawa Eclipse: The Last Compile",
    subtitle: "Final Level - Dawn of the Last Compile",
    chapterLabel: "Final Level: Bakunawa Eclipse",
    scene: FunctionsArraysBakunawaEclipseScene,
    sceneKey: "FunctionsArraysBakunawaEclipseScene",
    progressKey: `${FINAL_LESSON_KEY}-level-1`,
    nextRoute: "/Map",
    nextDelayMs: 1600,
    startWithDialogue: false,
    lockCodeUntilDialogueDone: true,
    defaultCode:
      "using System;\n\nnamespace SharpRunner {\n  class Program {\n    // Phase 2: traverse symbols and return the number of 0 values.\n    static int CountCorrupted(int[] symbols) {\n      // Write the counter and loop here.\n    }\n\n    // Phase 3: name the repair action.\n    static void RepairSymbol(int index) {\n    }\n\n    // Phase 4: combine two ward powers and return the result.\n    static int CalculateWard(int basePower, int bonus) {\n    }\n\n    // Phase 5: traverse every cell and return how many cells were visited.\n    static int CountMoonCells(int[,] moon) {\n    }\n\n    // Phase 6: stop at 0; otherwise call the next smaller phase.\n    static void BreakEclipse(int phase) {\n    }\n\n    static void Main(string[] args) {\n      // Phase 1\n      int[] symbols = { 1, 1, 0, 1 };\n      int[,] moon = { { 1, 1 }, { 1, 1 } };\n\n      // Call the five methods and store every returned value here.\n    }\n  }\n}",
    hint:
      "Complete the phases in order: count the 0, repair index 2, add the ward powers, traverse both moon dimensions, then recurse from phase 6 down to 0.",
    idleResultMessage: "The eclipsed moon is waiting for the last compile.",
    successResultMessage: "Compilation successful. Umaga na.",
    errorResultMessage: "Bakunawa found a broken phase. Repair the first phase named in the result.",
    goal: {
      title: "Goal",
      description:
        "Complete one final C# program that combines arrays, traversal, parameters, return values, two-dimensional arrays, and recursion to restore the moon.",
    },
    instruction: {
      title: "The Six Seals",
      items: [
        "Keep **int[] symbols = { 1, 1, 0, 1 };**. The single 0 is the corrupted moon seal.",
        "Define **static int CountCorrupted(int[] symbols)**. Traverse the array, count values equal to 0, and return the count.",
        "Define **static void RepairSymbol(int index)** and call **RepairSymbol(2);** from Main.",
        "Define **static int CalculateWard(int basePower, int bonus)** and return their sum.",
        "Define **static int CountMoonCells(int[,] moon)**. Use nested GetLength loops, inspect **moon[row, col]**, and return the visited-cell count.",
        "Define **static void BreakEclipse(int phase)**. Return when phase reaches 0; otherwise call **BreakEclipse(phase - 1)**. Begin with **BreakEclipse(6);**.",
        "From Main, call CountCorrupted, CalculateWard, and CountMoonCells and store each returned result.",
      ],
    },
    lessonCard: {
      title: "The Last Compile",
      description:
        "This final program combines the major skills from the journey. Each technique solves a different part of one larger algorithm.",
      sections: [
        {
          title: "Arrays And Traversal",
          body:
            "An array groups values under one name. A loop visits each valid index from 0 through Length - 1. A counter declared before the loop preserves the number of matching values found across all iterations.",
          code:
            "int count = 0;\nfor (int i = 0; i < values.Length; i++) {\n  if (values[i] == target) count++;\n}\nreturn count;",
        },
        {
          title: "Parameters And Return Values",
          body:
            "Parameters carry input into a method. A non-void return type promises that the method sends one result back. The caller should store that result so later parts of the program can use it.",
          code:
            "static int Add(int first, int second) {\n  return first + second;\n}\n\nint total = Add(5, 3);",
        },
        {
          title: "Two-Dimensional Arrays",
          body:
            "A rectangular array needs one loop for rows and another for columns. GetLength(0) is the row count, GetLength(1) is the column count, and grid[row, col] accesses the current cell.",
        },
        {
          title: "Recursion And The Base Case",
          body:
            "A recursive method calls itself with a smaller problem. The base case must stop the calls. Without it, the call stack continues growing until the program fails.",
          code:
            "static void Resolve(int phase) {\n  if (phase == 0) return;\n  Resolve(phase - 1);\n}",
        },
        {
          title: "Reading A Compile Failure",
          body:
            "Work from the earliest reported phase. Later code can depend on earlier declarations and returned values, so fixing errors in order prevents one mistake from hiding several others.",
        },
      ],
    },
    dialogue: {
      assetBase: DIALOGUE_ASSET_BASE,
      portraitImage: "diwata_dialogue.png",
      portraitAlt: "Diwata portrait",
      intro: [
        {
          speaker: "Diwata",
          portraitImage: "diwata_dialogue.png",
          portraitAlt: "Diwata portrait",
          lines: [
            {
              text: "Bakunawa has swallowed the last light of the moon. Every lesson brought us to this final compile.",
              tone: "danger",
            },
            {
              text: "Six seals bind the eclipse: array, traversal, repair, return, moon grid, and recursion.",
              tone: "normal",
            },
            {
              text: "Complete the program. Each correct phase restores one piece of moonlight. Break all six, and dawn will return.",
              tone: "goal",
            },
          ],
        },
      ],
    },
    validatorConfig: {
      type: "bakunawaFinale",
    },
    validateCode: createBakunawaFinaleValidator({
      successMessage: "The last compile succeeded. Breaking the eclipse...",
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
