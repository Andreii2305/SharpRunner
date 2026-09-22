const GENERAL_CLUE_DESCRIPTION =
  "Look around the game world for useful clues, such as characters, objects, signs, or their positions. Use what you notice with the written task.";

const LEVEL_ONE_CLUE_DESCRIPTION =
  "Kai begins on tiled ground. After this tutorial, drag sideways in the game world to find the portal if it is out of view. Compare their positions and the ground tiles between them, then use the task to decide what distance to try.";

export const GAME_TUTORIAL_STEPS = Object.freeze([
  {
    id: "world",
    title: "Game World",
    description: "This is where the level plays out. Your C# code changes what happens here, so watch the scene before and after a run.",
    target: "world",
    mobileTab: "game",
    placement: "right",
  },
  {
    id: "clues",
    title: "Observe the Clues",
    description: GENERAL_CLUE_DESCRIPTION,
    target: "world",
    mobileTab: "game",
    placement: "bottom",
  },
  {
    id: "task",
    title: "Your Task",
    description: "Read the Goal and Your Task before editing. Use them with clues from the game world to decide what your code should do.",
    target: "task",
    mobileTab: "lesson",
    placement: "top",
  },
  {
    id: "editor",
    title: "Code Editor",
    description: "Edit the C# code here. Starter code may be provided; change only what the task asks. The Lesson panel explains the concept if you need help.",
    target: "editor",
    mobileTab: "code",
    placement: "left",
  },
  {
    id: "run",
    title: "Run Your Code",
    description: "Use Run Code to try your current changes. Then watch the game world to see how it responds.",
    target: "run",
    mobileTab: "code",
    placement: "top",
  },
  {
    id: "feedback",
    title: "Read the Feedback",
    description: "This message starts with a prompt. After a run, read its feedback and compare it with what happened in the game world. Adjust your code and try again if needed.",
    target: "feedback",
    mobileTab: "code",
    placement: "top",
  },
  {
    id: "hints",
    title: "Hints",
    description: "If your class allows hints, this area shows when help unlocks after failed attempts. Basic guidance is free; personalized guidance may cost XP.",
    target: "hints",
    mobileTab: "code",
    placement: "top",
  },
  {
    id: "ready",
    title: "Ready to Play",
    description: "Observe the scene, read the task, edit your code, run it, and use the result to improve your solution.",
    target: null,
    mobileTab: "game",
    placement: "center",
  },
]);

const LEVEL_ONE_TUTORIAL_STEPS = Object.freeze(GAME_TUTORIAL_STEPS.map((step) =>
  step.id === "clues" ? { ...step, description: LEVEL_ONE_CLUE_DESCRIPTION } : step));

export const getGameTutorialSteps = (levelNumber) =>
  levelNumber === 1 ? LEVEL_ONE_TUTORIAL_STEPS : GAME_TUTORIAL_STEPS;
