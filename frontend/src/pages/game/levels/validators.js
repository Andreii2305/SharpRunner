const DECLARATION_REGEX =
  /\b(int|double|float|decimal|bool|string|String|char|long|short|byte|var)\s+([A-Za-z_]\w*)\s*(?:=\s*([^;]+))?\s*;/g;

const COMMENT_REGEX = /\/\/.*$|\/\*[\s\S]*?\*\//gm;

const stripComments = (sourceCode) => sourceCode.replace(COMMENT_REGEX, "");

const normalizeGoals = (goals) =>
  goals.map((goal) => ({
    ...goal,
    allowedTypes:
      goal.allowedTypes instanceof Set
        ? goal.allowedTypes
        : new Set(goal.allowedTypes ?? []),
  }));

const formatDeclaration = (goal, fallbackType = "string") => {
  const firstAllowedType = [...goal.allowedTypes][0] ?? fallbackType;
  return `${firstAllowedType} ${goal.name} = ${goal.requiredValue};`;
};

export const createExactGoalDeclarationValidator =
  ({
    goals,
    unexpectedVariableMessage,
    strictCountMessage = "Only the exact goal declarations are accepted for this level.",
    successMessage = "Exact goal declarations found.",
  }) =>
  (sourceCode) => {
    const normalizedGoals = normalizeGoals(goals);
    const goalsByName = new Map(normalizedGoals.map((goal) => [goal.name, goal]));
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const declarations = [...codeWithoutComments.matchAll(DECLARATION_REGEX)];
    const matchedGoals = new Set();

    for (const declaration of declarations) {
      const [, type, variableName, assignmentValue] = declaration;
      const goal = goalsByName.get(variableName);

      if (!goal) {
        return {
          isCorrect: false,
          message:
            unexpectedVariableMessage ??
            `Unexpected variable "${variableName}" for this level.`,
        };
      }

      if (matchedGoals.has(variableName)) {
        return {
          isCorrect: false,
          message: `Variable "${variableName}" is declared more than once.`,
        };
      }

      if (!goal.allowedTypes.has(type)) {
        const allowedTypes = [...goal.allowedTypes].join(" or ");
        return {
          isCorrect: false,
          message: `"${variableName}" must use type ${allowedTypes}.`,
        };
      }

      if (!assignmentValue || assignmentValue.trim() === "") {
        return {
          isCorrect: false,
          message: `"${variableName}" must be initialized with ${goal.requiredValue}.`,
        };
      }

      if (assignmentValue.trim() !== goal.requiredValue) {
        return {
          isCorrect: false,
          message: `"${variableName}" must be exactly ${goal.requiredValue}.`,
        };
      }

      matchedGoals.add(variableName);
    }

    for (const goal of normalizedGoals) {
      if (!matchedGoals.has(goal.name)) {
        return {
          isCorrect: false,
          message: `Missing goal declaration: ${formatDeclaration(goal)}`,
        };
      }
    }

    if (declarations.length !== normalizedGoals.length) {
      return {
        isCorrect: false,
        message: strictCountMessage,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
    };
  };
