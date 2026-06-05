import LevelOneScene from "../scenes/LevelOneScene";
import LevelTwoScene from "../scenes/LevelTwoScene";
import LevelThreeScene from "../scenes/LevelThreeScene";
import LevelFourScene from "../scenes/LevelFourScene";
import LevelFiveScene from "../scenes/LevelFiveScene";
import ArraysLevelOneScene from "../scenes/ArraysLevelOneScene";
import ArraysLevelTwoScene from "../scenes/ArraysLevelTwoScene";
import ArraysLevelThreeScene from "../scenes/ArraysLevelThreeScene";
import ArraysLevelFourScene from "../scenes/ArraysLevelFourScene";
import {
  createExactIntegerArrayDeclarationValidator,
  createExactStringArrayDeclarationValidator,
  createStringArrayAccessValidator,
  createExactGoalDeclarationValidator,
  createMultiStringDeclarationValidator,
  createSingleIntegerDeclarationValidator,
} from "./validators";

const LESSON_KEY = "tutorial";
const ARRAYS_LESSON_KEY = "arrays";
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
};

export const getLevelConfig = (levelNumber) =>
  LEVEL_CONFIG_BY_NUMBER[Number(levelNumber)] ?? null;

export const isLevelAvailable = (levelNumber) =>
  Boolean(getLevelConfig(levelNumber));

export const getAvailableLevelNumbers = () =>
  Object.keys(LEVEL_CONFIG_BY_NUMBER)
    .map((value) => Number(value))
    .sort((a, b) => a - b);
