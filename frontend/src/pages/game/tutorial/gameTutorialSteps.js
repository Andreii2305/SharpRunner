// Phase B proves the DOM tour flow. Scene-specific clue wording belongs in Phase C.
export const GAME_TUTORIAL_STEPS = Object.freeze([
  {
    id: "world",
    title: "Game World",
    description: "Your code changes what happens here. Look at the characters, objects, and path before you begin.",
    target: "world",
    mobileTab: "game",
    placement: "right",
  },
  {
    id: "task",
    title: "Your Task",
    description: "Read the goal and task to learn what this level asks you to change.",
    target: "task",
    mobileTab: "lesson",
    placement: "top",
  },
  {
    id: "editor",
    title: "Code Editor",
    description: "Edit the prepared C# code here. Keep the parts the task says are already provided.",
    target: "editor",
    mobileTab: "code",
    placement: "left",
  },
  {
    id: "run",
    title: "Run Code",
    description: "After the tutorial, run your code. Watch the game and read the feedback, then correct your code if needed.",
    target: "run",
    mobileTab: "code",
    placement: "top",
  },
]);
