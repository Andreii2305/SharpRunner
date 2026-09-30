export const ACADEMIC_LESSONS = Object.freeze([
  { key: "arrays", title: "Arrays" },
  { key: "functions", title: "Functions and Methods" },
  { key: "functions-with-arrays", title: "Functions with Arrays" },
  { key: "final", title: "Final: Bakunawa Eclipse" },
]);

let sequence = 0;
const clientId = (prefix) => `${prefix}-${Date.now()}-${sequence += 1}`;
const choice = (choiceText = "", isCorrect = false) => ({ clientId: clientId("choice"), choiceText, isCorrect });

export const assessmentStatus = (summary = {}) => {
  if (!summary.exists) return "Not created";
  if (summary.attemptsExist) return "Locked";
  return summary.published ? "Published" : "Draft";
};

export const createAssessmentDraft = (type, lessonKey) => ({
  id: null,
  lessonKey,
  type,
  title: `${ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey)?.title ?? "Lesson"} ${type === "PRE" ? "Pre-Test" : "Post-Test"}`,
  instructions: "",
  isRequired: true,
  isPublished: false,
  passingPercentage: type === "PRE" ? null : 75,
  maxAttempts: type === "PRE" ? 1 : 3,
  requirePassingForCompletion: type === "POST",
  showScoreAfterSubmission: true,
  answerReviewPolicy: type === "PRE" ? "NEVER" : "AFTER_FINAL_ATTEMPT",
  shuffleQuestions: true,
  shuffleChoices: true,
  version: 1,
  attemptsExist: false,
  structureLocked: false,
  questions: [],
});

export const hydrateAssessmentDraft = (assessment) => ({
  ...assessment,
  instructions: assessment.instructions ?? "",
  questions: (assessment.questions ?? []).map((question) => ({
    ...question,
    clientId: `question-${question.id}`,
    explanation: question.explanation ?? "",
    objectiveKey: question.objectiveKey ?? "",
    choices: (question.choices ?? []).map((item) => ({ ...item, clientId: `choice-${item.id}` })),
  })),
});

const newQuestion = (questionType) => ({
  clientId: clientId("question"),
  questionText: "",
  questionType,
  points: 1,
  explanation: "",
  objectiveKey: "",
  choices: questionType === "TRUE_FALSE"
    ? [choice("True", true), choice("False", false)]
    : [choice("", true), choice("", false)],
});

export const addQuestion = (questions, questionType = "MULTIPLE_CHOICE") => [...questions, newQuestion(questionType)];
export const removeQuestion = (questions, id) => questions.filter((question) => question.clientId !== id);

const move = (items, index, delta) => {
  const destination = index + delta;
  if (index < 0 || destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
};

export const moveQuestion = (questions, index, delta) => move(questions, index, delta);
const changeQuestion = (questions, id, transform) => questions.map((question) => (
  question.clientId === id ? transform(question) : question
));

export const updateQuestionType = (questions, id, questionType) => changeQuestion(questions, id, (question) => ({
  ...question,
  questionType,
  choices: questionType === "TRUE_FALSE"
    ? [choice("True", true), choice("False", false)]
    : question.questionType === "TRUE_FALSE" ? [choice("", true), choice("", false)] : question.choices,
}));
export const addChoice = (questions, id) => changeQuestion(questions, id, (question) => ({ ...question, choices: [...question.choices, choice()] }));
export const removeChoice = (questions, id, choiceId) => changeQuestion(questions, id, (question) => ({ ...question, choices: question.choices.filter((item) => item.clientId !== choiceId) }));
export const moveChoice = (questions, id, index, delta) => changeQuestion(questions, id, (question) => ({ ...question, choices: move(question.choices, index, delta) }));
export const selectCorrectChoice = (questions, id, choiceId) => changeQuestion(questions, id, (question) => ({ ...question, choices: question.choices.map((item) => ({ ...item, isCorrect: item.clientId === choiceId })) }));

const settings = (draft) => ({
  title: draft.title,
  instructions: draft.instructions || null,
  isRequired: Boolean(draft.isRequired),
  passingPercentage: draft.type === "PRE" ? null : Number(draft.passingPercentage),
  maxAttempts: draft.type === "PRE" ? 1 : Number(draft.maxAttempts),
  requirePassingForCompletion: draft.type === "POST" && Boolean(draft.requirePassingForCompletion),
  showScoreAfterSubmission: Boolean(draft.showScoreAfterSubmission),
  answerReviewPolicy: draft.answerReviewPolicy,
  shuffleQuestions: Boolean(draft.shuffleQuestions),
  shuffleChoices: Boolean(draft.shuffleChoices),
});

export const buildSaveGraph = (draft) => ({
  version: Number(draft.version),
  settings: settings(draft),
  questions: draft.questions.map((question) => ({
    questionText: question.questionText,
    questionType: question.questionType,
    points: Number(question.points),
    explanation: question.explanation || null,
    objectiveKey: question.objectiveKey || null,
    choices: question.choices.map((item) => ({ choiceText: item.choiceText, isCorrect: Boolean(item.isCorrect) })),
  })),
});

export const publishIssues = (draft) => {
  const issues = [];
  if (!draft.title?.trim()) issues.push("Add an assessment title.");
  if (!draft.questions.length) issues.push("Add at least one question.");
  draft.questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.questionText?.trim()) issues.push(`${label}: add question text.`);
    if (!Number.isFinite(Number(question.points)) || Number(question.points) <= 0) issues.push(`${label}: points must be greater than zero.`);
    if (question.choices.length < 2 || question.choices.some((item) => !item.choiceText?.trim())) issues.push(`${label}: complete at least two choices.`);
    if (question.choices.filter((item) => item.isCorrect).length !== 1) issues.push(`${label}: select exactly one correct answer.`);
  });
  return issues;
};
