export const LESSON_ONE_MAP_CONFIG = {
  lessonKey: "tutorial",
  lessonTitle: "Tutorial: First Compile Trial",
  subtitle:
    "Kai learns the controls and first coding habits before entering Barangay Malumay.",

  stages: [
    {
      id: "stage-1",
      title: "Stage 1 - First Compile Trial",
      subtitle: "movement, inputs, counts, and precision",
      x: 50,
      y: 10,
    },
  ],

  nodes: [
    {
      id: "tutorial-level-1",
      levelNumber: 1,
      title: "The Awakening",
      x: 12,
      y: 35,
    },
    {
      id: "tutorial-level-2",
      levelNumber: 2,
      title: "What Is Your Name?",
      x: 28,
      y: 28,
    },
    {
      id: "tutorial-level-3",
      levelNumber: 3,
      title: "Voices of the Village",
      x: 45,
      y: 35,
    },
    {
      id: "tutorial-level-4",
      levelNumber: 4,
      title: "The Coin Keeper",
      x: 62,
      y: 28,
    },
    {
      id: "tutorial-level-5",
      levelNumber: 5,
      title: "Potion Measure",
      x: 80,
      y: 35,
    },
  ],

  connections: [
    { fromId: "tutorial-level-1", toId: "tutorial-level-2" },
    { fromId: "tutorial-level-2", toId: "tutorial-level-3" },
    { fromId: "tutorial-level-3", toId: "tutorial-level-4" },
    { fromId: "tutorial-level-4", toId: "tutorial-level-5" },
  ],
};
