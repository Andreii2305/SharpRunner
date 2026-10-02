export const ACADEMIC_LESSONS = Object.freeze([
  { key: "arrays", title: "Arrays" },
  { key: "functions", title: "Functions and Methods" },
  { key: "functions-with-arrays", title: "Functions with Arrays" },
  { key: "final", title: "Final: Bakunawa Eclipse" },
]);

let sequence = 0;
const clientId = (prefix) => `${prefix}-${Date.now()}-${sequence += 1}`;
const choice = (choiceText = "", isCorrect = false) => ({ clientId: clientId("choice"), choiceText, isCorrect });
export const METHOD_TYPES = Object.freeze(["bool", "int", "long", "string", "bool[]", "int[]", "long[]", "string[]"]);
export const defaultValueForType = (type) => type?.endsWith("[]") ? []
  : type === "bool" ? false
    : type === "string" ? "" : 0;

const codingFields = () => ({
  choices: [],
  executionMode: "METHOD",
  starterCode: "",
  referenceSolution: "",
  methodContract: { typeName: "", methodName: "", parameterTypes: [], returnType: "int" },
  codingTestCases: [],
});

const codingTestCase = (question, visibility = "PUBLIC") => ({
  clientId: clientId("coding-test"),
  visibility,
  input: question.executionMode === "PROGRAM" ? "" : question.methodContract.parameterTypes.map(defaultValueForType),
  expectedOutput: question.executionMode === "PROGRAM" ? "" : defaultValueForType(question.methodContract.returnType),
  weight: 1,
});

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
    ...(question.questionType === "CODING" ? {
      executionMode: question.executionMode ?? "METHOD",
      starterCode: question.starterCode ?? "",
      referenceSolution: question.referenceSolution ?? "",
      methodContract: {
        typeName: question.methodContract?.typeName ?? "",
        methodName: question.methodContract?.methodName ?? "",
        parameterTypes: [...(question.methodContract?.parameterTypes ?? [])],
        returnType: question.methodContract?.returnType ?? "int",
      },
      codingTestCases: (question.codingTestCases ?? []).map((item, index) => ({
        ...item, clientId: `coding-test-${item.id ?? index}`,
      })),
    } : {}),
  })),
});

const newQuestion = (questionType) => ({
  clientId: clientId("question"),
  questionText: "",
  questionType,
  points: 1,
  explanation: "",
  objectiveKey: "",
  ...(questionType === "CODING" ? codingFields() : {
    choices: questionType === "TRUE_FALSE"
      ? [choice("True", true), choice("False", false)]
      : [choice("", true), choice("", false)],
  }),
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

export const updateQuestionType = (questions, id, questionType) => changeQuestion(questions, id, (question) => {
  const common = Object.fromEntries(Object.entries(question).filter(([key]) => (
    !["choices", "starterCode", "referenceSolution", "methodContract", "codingTestCases"].includes(key)
  )));
  if (questionType === "CODING") return { ...common, questionType, ...codingFields() };
  return {
    ...common,
    questionType,
    choices: questionType === "TRUE_FALSE"
      ? [choice("True", true), choice("False", false)]
      : [choice("", true), choice("", false)],
  };
});
export const updateCodingExecutionMode = (questions, id, executionMode) => changeQuestion(questions, id, (question) => ({
  ...question,
  executionMode,
  methodContract: executionMode === "METHOD"
    ? { typeName: "", methodName: "", parameterTypes: [], returnType: "int" }
    : { typeName: "", methodName: "", parameterTypes: [], returnType: "int" },
  codingTestCases: [],
}));
export const codingModeChangeRequiresConfirmation = (question, nextMode) => {
  const executionMode = question.executionMode ?? "METHOD";
  if (executionMode === nextMode) return false;
  if ((question.codingTestCases ?? []).length > 0) return true;
  if (executionMode !== "METHOD") return false;
  const contract = question.methodContract ?? {};
  return Boolean(contract.typeName?.trim() || contract.methodName?.trim()
    || contract.parameterTypes?.length || (contract.returnType ?? "int") !== "int");
};
export const addChoice = (questions, id) => changeQuestion(questions, id, (question) => ({ ...question, choices: [...question.choices, choice()] }));
export const removeChoice = (questions, id, choiceId) => changeQuestion(questions, id, (question) => ({ ...question, choices: question.choices.filter((item) => item.clientId !== choiceId) }));
export const moveChoice = (questions, id, index, delta) => changeQuestion(questions, id, (question) => ({ ...question, choices: move(question.choices, index, delta) }));
export const selectCorrectChoice = (questions, id, choiceId) => changeQuestion(questions, id, (question) => ({ ...question, choices: question.choices.map((item) => ({ ...item, isCorrect: item.clientId === choiceId })) }));

export const addCodingParameter = (questions, id, type = "int") => changeQuestion(questions, id, (question) => ({
  ...question,
  methodContract: { ...question.methodContract, parameterTypes: [...question.methodContract.parameterTypes, type] },
  codingTestCases: question.codingTestCases.map((testCase) => ({ ...testCase, input: [...testCase.input, defaultValueForType(type)] })),
}));
export const removeCodingParameter = (questions, id, index) => changeQuestion(questions, id, (question) => ({
  ...question,
  methodContract: { ...question.methodContract, parameterTypes: question.methodContract.parameterTypes.filter((_, itemIndex) => itemIndex !== index) },
  codingTestCases: question.codingTestCases.map((testCase) => ({ ...testCase, input: testCase.input.filter((_, itemIndex) => itemIndex !== index) })),
}));
export const moveCodingParameter = (questions, id, index, delta) => changeQuestion(questions, id, (question) => {
  const parameterTypes = move(question.methodContract.parameterTypes, index, delta);
  return {
    ...question,
    methodContract: { ...question.methodContract, parameterTypes },
    codingTestCases: question.codingTestCases.map((testCase) => ({ ...testCase, input: move(testCase.input, index, delta) })),
  };
});
export const updateCodingParameterType = (questions, id, index, type) => changeQuestion(questions, id, (question) => ({
  ...question,
  methodContract: { ...question.methodContract, parameterTypes: question.methodContract.parameterTypes.map((item, itemIndex) => itemIndex === index ? type : item) },
  codingTestCases: question.codingTestCases.map((testCase) => ({ ...testCase, input: testCase.input.map((value, itemIndex) => itemIndex === index ? defaultValueForType(type) : value) })),
}));
export const updateCodingReturnType = (questions, id, type) => changeQuestion(questions, id, (question) => ({
  ...question,
  methodContract: { ...question.methodContract, returnType: type },
  codingTestCases: question.codingTestCases.map((testCase) => ({ ...testCase, expectedOutput: defaultValueForType(type) })),
}));
export const addCodingTestCase = (questions, id, visibility = "PUBLIC") => changeQuestion(questions, id, (question) => ({
  ...question, codingTestCases: [...question.codingTestCases, codingTestCase(question, visibility)],
}));
export const removeCodingTestCase = (questions, id, index) => changeQuestion(questions, id, (question) => ({
  ...question, codingTestCases: question.codingTestCases.filter((_, itemIndex) => itemIndex !== index),
}));
export const moveCodingTestCase = (questions, id, index, delta) => changeQuestion(questions, id, (question) => ({
  ...question, codingTestCases: move(question.codingTestCases, index, delta),
}));

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
    choices: question.questionType === "CODING" ? [] : question.choices.map((item) => ({ choiceText: item.choiceText, isCorrect: Boolean(item.isCorrect) })),
    ...(question.questionType === "CODING" ? {
      executionMode: question.executionMode ?? "METHOD",
      starterCode: question.starterCode,
      referenceSolution: question.referenceSolution,
      ...(question.executionMode !== "PROGRAM" ? { methodContract: {
        typeName: question.methodContract.typeName,
        methodName: question.methodContract.methodName,
        parameterTypes: [...question.methodContract.parameterTypes],
        returnType: question.methodContract.returnType,
      } } : {}),
      codingTestCases: question.codingTestCases.map((testCase) => ({
        visibility: testCase.visibility,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        weight: Number(testCase.weight),
      })),
    } : {}),
  })),
});

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const qualifiedIdentifier = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*$/;
const utf8Bytes = (value) => new TextEncoder().encode(String(value)).length;
const validScalar = (type, value) => type === "bool" ? typeof value === "boolean"
  : type === "string" ? typeof value === "string" && utf8Bytes(value) <= 4096
    : type === "int" ? Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
      : type === "long" ? Number.isSafeInteger(value) : false;
const validTypedValue = (type, value) => type?.endsWith("[]")
  ? Array.isArray(value) && value.length <= 256 && value.every((item) => validScalar(type.slice(0, -2), item))
  : validScalar(type, value);

export const publishIssues = (draft) => {
  const issues = [];
  if (!draft.title?.trim()) issues.push("Add an assessment title.");
  if (!draft.questions.length) issues.push("Add at least one question.");
  draft.questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.questionText?.trim()) issues.push(`${label}: add question text.`);
    if (!Number.isFinite(Number(question.points)) || Number(question.points) <= 0) issues.push(`${label}: points must be greater than zero.`);
    if (question.questionType === "CODING") {
      const executionMode = question.executionMode ?? "METHOD";
      const contract = question.methodContract ?? {};
      if (executionMode === "METHOD") {
        if (!qualifiedIdentifier.test(contract.typeName ?? "")) issues.push(`${label}: add a valid type/class name.`);
        if (!identifier.test(contract.methodName ?? "")) issues.push(`${label}: add a valid method name.`);
        if (!METHOD_TYPES.includes(contract.returnType) || (contract.parameterTypes ?? []).some((type) => !METHOD_TYPES.includes(type))) issues.push(`${label}: select only supported method types.`);
      }
      if (!question.starterCode?.trim()) issues.push(`${label}: add starter code.`);
      else if (utf8Bytes(question.starterCode) > 16 * 1024) issues.push(`${label}: starter code must be 16 KB or smaller.`);
      if (!question.referenceSolution?.trim()) issues.push(`${label}: add a reference solution.`);
      else if (utf8Bytes(question.referenceSolution) > 16 * 1024) issues.push(`${label}: reference solution must be 16 KB or smaller.`);
      if (!question.codingTestCases?.length) issues.push(`${label}: add at least one test case.`);
      if (!question.codingTestCases?.some((testCase) => testCase.visibility === "HIDDEN")) issues.push(`${label}: add at least one HIDDEN test case.`);
      question.codingTestCases?.forEach((testCase, testIndex) => {
        const weight = Number(testCase.weight);
        if (!Number.isFinite(weight) || weight <= 0) issues.push(`${label}, test ${testIndex + 1}: weight must be greater than zero.`);
        else if (weight > 99999999.99 || Math.round(weight * 100) / 100 !== weight) issues.push(`${label}, test ${testIndex + 1}: weight must fit eight digits and at most two decimal places.`);
        if (executionMode === "PROGRAM") {
          if (typeof testCase.input !== "string" || utf8Bytes(testCase.input) > 4096) issues.push(`${label}, test ${testIndex + 1}: standard input must be 4 KB or smaller.`);
          if (typeof testCase.expectedOutput !== "string" || utf8Bytes(testCase.expectedOutput) > 8192) issues.push(`${label}, test ${testIndex + 1}: expected output must be 8 KB or smaller.`);
        } else {
          if (!Array.isArray(testCase.input) || testCase.input.length !== (contract.parameterTypes ?? []).length
            || testCase.input.some((value, valueIndex) => !validTypedValue(contract.parameterTypes[valueIndex], value))) issues.push(`${label}, test ${testIndex + 1}: complete valid typed inputs.`);
          if (!validTypedValue(contract.returnType, testCase.expectedOutput)) issues.push(`${label}, test ${testIndex + 1}: complete a valid expected output.`);
        }
      });
      if (utf8Bytes(JSON.stringify(question.codingTestCases?.map((testCase) => testCase.input) ?? [])) > 16 * 1024) issues.push(`${label}: test inputs must total 16 KB or smaller.`);
    } else {
      if (question.choices.length < 2 || question.choices.some((item) => !item.choiceText?.trim())) issues.push(`${label}: complete at least two choices.`);
      if (question.choices.filter((item) => item.isCorrect).length !== 1) issues.push(`${label}: select exactly one correct answer.`);
    }
  });
  return issues;
};
