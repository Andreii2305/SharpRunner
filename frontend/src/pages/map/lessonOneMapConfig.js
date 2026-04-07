export const LESSON_ONE_MAP_CONFIG = {
  lessonKey: "variables-and-data-types",
  lessonTitle: "Variables and Data Types — The Castle of Syntax",
  subtitle:
    'A knight apprentice learning "code magic" to reach the castle gate.',

  stages: [
    {
      id: "stage-1",
      title: "Stage 1 · Castle Grounds",
      subtitle: "Mastering Variables",
      x: 50,
      y: 10,
    },
    {
      id: "stage-2",
      title: "Stage 2 · Hall of Types",
      subtitle: "Exploring Data Types",
      x: 50,
      y: 51,
    },
  ],

  nodes: [
    /* ── Stage 1 (levels 1–5, level 5 is boss) ── */
    {
      id: "lesson1-level-1",
      levelNumber: 1,
      title: "The Awakening",
      x: 12,
      y: 27,
    },
    {
      id: "lesson1-level-2",
      levelNumber: 2,
      title: "What Is Your Name?",
      x: 28,
      y: 23,
    },
    {
      id: "lesson1-level-3",
      levelNumber: 3,
      title: "Voices of the Village",
      x: 45,
      y: 27,
    },
    {
      id: "lesson1-level-4",
      levelNumber: 4,
      title: "The Coin Keeper",
      x: 62,
      y: 23,
    },
    {
      id: "lesson1-level-5",
      levelNumber: 5,
      title: "Archivist of Types",
      x: 80,
      y: 27,
    },

    /* ── Stage 2 (levels 6–10, level 10 is boss) ── */
    {
      id: "lesson1-level-6",
      levelNumber: 6,
      title: "Potion Measure",
      x: 14,
      y: 74,
    },
    {
      id: "lesson1-level-7",
      levelNumber: 7,
      title: "Rune Letter",
      x: 30,
      y: 68,
    },
    {
      id: "lesson1-level-8",
      levelNumber: 8,
      title: "Oath of Truth",
      x: 48,
      y: 75,
    },
    {
      id: "lesson1-level-9",
      levelNumber: 9,
      title: "Pack the Journey",
      x: 65,
      y: 68,
    },
    {
      id: "lesson1-level-10",
      levelNumber: 10,
      title: "Gate of Declarations",
      x: 82,
      y: 74,
    },
  ],

  connections: [
    /* Stage 1 chain */
    { fromId: "lesson1-level-1", toId: "lesson1-level-2" },
    { fromId: "lesson1-level-2", toId: "lesson1-level-3" },
    { fromId: "lesson1-level-3", toId: "lesson1-level-4" },
    { fromId: "lesson1-level-4", toId: "lesson1-level-5" },
    /* Stage 2 chain */
    { fromId: "lesson1-level-6", toId: "lesson1-level-7" },
    { fromId: "lesson1-level-7", toId: "lesson1-level-8" },
    { fromId: "lesson1-level-8", toId: "lesson1-level-9" },
    { fromId: "lesson1-level-9", toId: "lesson1-level-10" },
  ],
};