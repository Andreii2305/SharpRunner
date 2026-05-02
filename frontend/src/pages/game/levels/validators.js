const DECLARATION_REGEX =
  /\b(int|double|float|decimal|bool|string|String|char|long|short|byte|var)\s+([A-Za-z_]\w*)\s*(?:=\s*([^;]+))?\s*;/g;

const COMMENT_REGEX = /\/\/.*$|\/\*[\s\S]*?\*\//gm;
const INTEGER_LITERAL_REGEX = /^-?\d+$/;
const QUOTED_STRING_REGEX = /^"(.*)"$/s;

const stripComments = (sourceCode) => sourceCode.replace(COMMENT_REGEX, "");

const parseDeclarationValue = (valueExpression) => {
  const trimmed = (valueExpression ?? "").trim();
  const stringMatch = trimmed.match(QUOTED_STRING_REGEX);
  if (stringMatch) {
    return stringMatch[1];
  }

  return trimmed;
};

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
    const goalValues = {};

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
      goalValues[variableName] = parseDeclarationValue(assignmentValue);
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
      payload: {
        values: goalValues,
      },
    };
  };

export const createMultiStringDeclarationValidator =
  ({
    variableNames,
    unexpectedVariableMessage,
    successMessage = "All string declarations accepted.",
  }) =>
  (sourceCode) => {
    const requiredNames = new Set(variableNames ?? []);
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const declarations = [...codeWithoutComments.matchAll(DECLARATION_REGEX)];
    const declaredNames = new Set();
    const values = {};

    for (const declaration of declarations) {
      const [, type, name, assignmentValue] = declaration;

      if (!requiredNames.has(name)) {
        return {
          isCorrect: false,
          message:
            unexpectedVariableMessage ??
            `Unexpected variable "${name}". Only the required string variables are allowed in this level.`,
        };
      }

      if (declaredNames.has(name)) {
        return {
          isCorrect: false,
          message: `Variable "${name}" is declared more than once.`,
        };
      }

      if (type !== "string") {
        return {
          isCorrect: false,
          message: `"${name}" must use type string.`,
        };
      }

      const trimmedValue = assignmentValue?.trim() ?? "";
      if (!trimmedValue) {
        return {
          isCorrect: false,
          message: `"${name}" must be initialized with a quoted string value.`,
        };
      }

      const stringMatch = trimmedValue.match(QUOTED_STRING_REGEX);
      if (!stringMatch) {
        return {
          isCorrect: false,
          message: `"${name}" must be assigned a quoted string (example: "hello").`,
        };
      }

      if (stringMatch[1] === "") {
        return {
          isCorrect: false,
          message: `"${name}" must not be an empty string.`,
        };
      }

      declaredNames.add(name);
      values[name] = stringMatch[1];
    }

    for (const requiredName of requiredNames) {
      if (!declaredNames.has(requiredName)) {
        return {
          isCorrect: false,
          message: `Missing declaration: string ${requiredName} = "...";`,
        };
      }
    }

    if (declarations.length !== requiredNames.size) {
      return {
        isCorrect: false,
        message: "Only the required string declarations are accepted for this level.",
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: { values },
    };
  };

export const createSingleIntegerDeclarationValidator =
  ({
    variableName,
    allowedTypes = ["int"],
    minValue = 0,
    maxValue = 100,
    unexpectedVariableMessage,
    successMessage = "Declaration accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const declarations = [...codeWithoutComments.matchAll(DECLARATION_REGEX)];
    const allowedTypeSet = new Set(allowedTypes);

    if (declarations.length !== 1) {
      return {
        isCorrect: false,
        message: `Declare exactly one variable: int ${variableName} = <value>;`,
      };
    }

    const [, type, name, assignmentValue] = declarations[0];

    if (name !== variableName) {
      return {
        isCorrect: false,
        message:
          unexpectedVariableMessage ??
          `Unexpected variable "${name}". Use only "${variableName}" in this level.`,
      };
    }

    if (!allowedTypeSet.has(type)) {
      return {
        isCorrect: false,
        message: `"${variableName}" must use type int.`,
      };
    }

    const trimmedAssignment = assignmentValue?.trim() ?? "";
    if (!trimmedAssignment) {
      return {
        isCorrect: false,
        message: `"${variableName}" must be initialized with a whole number.`,
      };
    }

    if (!INTEGER_LITERAL_REGEX.test(trimmedAssignment)) {
      return {
        isCorrect: false,
        message: `"${variableName}" must use an integer literal (example: 24).`,
      };
    }

    const value = Number.parseInt(trimmedAssignment, 10);
    if (value < minValue || value > maxValue) {
      return {
        isCorrect: false,
        message: `"${variableName}" must be between ${minValue} and ${maxValue}.`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { [variableName]: value },
      },
    };
  };
