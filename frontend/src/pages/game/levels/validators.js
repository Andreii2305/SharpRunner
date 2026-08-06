const DECLARATION_REGEX =
  /\b(int|double|float|decimal|bool|string|String|char|long|short|byte|var)\s+([A-Za-z_]\w*)\s*(?:=\s*([^;]+))?\s*;/g;

const COMMENT_REGEX = /\/\/.*$|\/\*[\s\S]*?\*\//gm;
const INTEGER_LITERAL_REGEX = /^-?\d+$/;
const QUOTED_STRING_REGEX = /^"(.*)"$/s;
const INT_ARRAY_DECLARATION_REGEX =
  /\bint\s*\[\s*\]\s+([A-Za-z_]\w*)\s*=\s*\{([^}]*)\}\s*;/g;
const STRING_ARRAY_DECLARATION_REGEX =
  /\b(?:string|String)\s*\[\s*\]\s+([A-Za-z_]\w*)\s*=\s*\{([^}]*)\}\s*;/g;
const STRING_ARRAY_ACCESS_REGEX =
  /^([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]$/;
const INT_2D_ARRAY_DECLARATION_REGEX =
  /\bint\s*\[\s*,\s*\]\s+([A-Za-z_]\w*)\s*=\s*\{([\s\S]*?)\}\s*;/g;

const stripComments = (sourceCode) => sourceCode.replace(COMMENT_REGEX, "");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractBalancedBody = (sourceCode, signatureRegex) => {
  const signature = signatureRegex.exec(sourceCode);
  if (!signature) return null;
  const openingBrace = sourceCode.indexOf("{", signature.index);
  if (openingBrace < 0) return null;

  let depth = 0;
  for (let index = openingBrace; index < sourceCode.length; index += 1) {
    if (sourceCode[index] === "{") depth += 1;
    if (sourceCode[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return sourceCode.slice(openingBrace + 1, index);
  }
  return null;
};

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
        : new Set(
            typeof goal.allowedTypes === "string"
              ? [goal.allowedTypes]
              : goal.allowedTypes ?? [],
          ),
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
        payload: {
          values: { [variableName]: value },
        },
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

export const createExactIntegerArrayDeclarationValidator =
  ({
    variableName,
    expectedValues,
    unexpectedVariableMessage,
    successMessage = "Array declaration accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const arrayDeclarations = [
      ...codeWithoutComments.matchAll(INT_ARRAY_DECLARATION_REGEX),
    ];
    const otherDeclarations = [
      ...codeWithoutComments.matchAll(DECLARATION_REGEX),
    ].filter((declaration) => !declaration[0].includes("[]"));

    if (arrayDeclarations.length !== 1 || otherDeclarations.length > 0) {
      return {
        isCorrect: false,
        message: `Declare exactly one int array: int[] ${variableName} = { ... };`,
      };
    }

    const [, declaredName, rawItems] = arrayDeclarations[0];
    if (declaredName !== variableName) {
      return {
        isCorrect: false,
        message:
          unexpectedVariableMessage ??
          `Unexpected array "${declaredName}". Use only "${variableName}" in this level.`,
      };
    }

    const values = rawItems
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (values.length !== expectedValues.length) {
      return {
        isCorrect: false,
        message: `"${variableName}" must contain ${expectedValues.length} numbers.`,
      };
    }

    const parsedValues = [];
    for (const value of values) {
      if (!INTEGER_LITERAL_REGEX.test(value)) {
        return {
          isCorrect: false,
          message: `"${variableName}" must contain only integer literals.`,
        };
      }
      parsedValues.push(Number.parseInt(value, 10));
    }

    const matches = expectedValues.every(
      (expected, index) => parsedValues[index] === expected,
    );

    if (!matches) {
      return {
        isCorrect: false,
        message: `"${variableName}" must be exactly { ${expectedValues.join(", ")} }.`,
        payload: {
          values: { [variableName]: parsedValues },
        },
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { [variableName]: parsedValues },
      },
    };
  };

export const createExactStringArrayDeclarationValidator =
  ({
    variableName,
    expectedValues,
    unexpectedVariableMessage,
    successMessage = "String array declaration accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const arrayDeclarations = [
      ...codeWithoutComments.matchAll(STRING_ARRAY_DECLARATION_REGEX),
    ];
    const otherDeclarations = [
      ...codeWithoutComments.matchAll(DECLARATION_REGEX),
    ].filter((declaration) => !declaration[0].includes("[]"));

    if (arrayDeclarations.length !== 1 || otherDeclarations.length > 0) {
      return {
        isCorrect: false,
        message: `Declare exactly one string array: string[] ${variableName} = { ... };`,
      };
    }

    const [, declaredName, rawItems] = arrayDeclarations[0];
    if (declaredName !== variableName) {
      return {
        isCorrect: false,
        message:
          unexpectedVariableMessage ??
          `Unexpected array "${declaredName}". Use only "${variableName}" in this level.`,
      };
    }

    const values = rawItems
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (values.length !== expectedValues.length) {
      return {
        isCorrect: false,
        message: `"${variableName}" must contain ${expectedValues.length} text values.`,
      };
    }

    const parsedValues = [];
    for (const value of values) {
      const stringMatch = value.match(QUOTED_STRING_REGEX);
      if (!stringMatch) {
        return {
          isCorrect: false,
          message: `"${variableName}" must contain quoted strings.`,
        };
      }
      parsedValues.push(stringMatch[1]);
    }

    const matches = expectedValues.every(
      (expected, index) => parsedValues[index] === expected,
    );

    if (!matches) {
      return {
        isCorrect: false,
        message: `"${variableName}" must list the supplies in the correct order.`,
        payload: {
          values: { [variableName]: parsedValues },
        },
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { [variableName]: parsedValues },
      },
    };
  };

export const createStringArrayAccessValidator =
  ({
    arrayName,
    arrayValues,
    targetVariableName,
    expectedIndex,
    unexpectedVariableMessage,
    successMessage = "Array index access accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const arrayDeclarations = [
      ...codeWithoutComments.matchAll(STRING_ARRAY_DECLARATION_REGEX),
    ];
    const scalarDeclarations = [...codeWithoutComments.matchAll(DECLARATION_REGEX)];

    if (arrayDeclarations.length !== 1 || scalarDeclarations.length !== 1) {
      return {
        isCorrect: false,
        message:
          `Declare one string array and one attack variable: string ${targetVariableName} = ${arrayName}[index];`,
      };
    }

    const [, declaredArrayName, rawItems] = arrayDeclarations[0];
    if (declaredArrayName !== arrayName) {
      return {
        isCorrect: false,
        message:
          unexpectedVariableMessage ??
          `Unexpected array "${declaredArrayName}". Use only "${arrayName}" in this level.`,
      };
    }

    const parsedArrayValues = rawItems
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const match = item.match(QUOTED_STRING_REGEX);
        return match ? match[1] : null;
      });

    if (
      parsedArrayValues.length !== arrayValues.length ||
      parsedArrayValues.some((value) => value === null)
    ) {
      return {
        isCorrect: false,
        message: `"${arrayName}" must contain ${arrayValues.length} quoted string values.`,
      };
    }

    const arrayMatches = arrayValues.every(
      (expectedValue, index) => parsedArrayValues[index] === expectedValue,
    );
    if (!arrayMatches) {
      return {
        isCorrect: false,
        message: `"${arrayName}" must be exactly { ${arrayValues.map((value) => `"${value}"`).join(", ")} }.`,
        payload: {
          values: { [arrayName]: parsedArrayValues },
        },
      };
    }

    const [, type, declaredVariableName, assignmentValue] = scalarDeclarations[0];
    if (declaredVariableName !== targetVariableName) {
      return {
        isCorrect: false,
        message:
          unexpectedVariableMessage ??
          `Unexpected variable "${declaredVariableName}". Use only "${targetVariableName}" in this level.`,
      };
    }

    if (type !== "string" && type !== "String") {
      return {
        isCorrect: false,
        message: `"${targetVariableName}" must use type string.`,
      };
    }

    const accessMatch = (assignmentValue ?? "").trim().match(STRING_ARRAY_ACCESS_REGEX);
    if (!accessMatch || accessMatch[1] !== arrayName) {
      return {
        isCorrect: false,
        message: `"${targetVariableName}" must get its value from ${arrayName}[index].`,
      };
    }

    const selectedIndex = Number.parseInt(accessMatch[2], 10);
    const selectedValue = parsedArrayValues[selectedIndex];
    if (selectedValue === undefined) {
      return {
        isCorrect: false,
        message: `"${arrayName}" has no index ${selectedIndex}. Use an index from 0 to ${arrayValues.length - 1}.`,
        payload: {
          values: {
            [arrayName]: parsedArrayValues,
            [targetVariableName]: null,
            attackIndex: selectedIndex,
          },
        },
      };
    }

    const payload = {
      values: {
        [arrayName]: parsedArrayValues,
        [targetVariableName]: selectedValue,
        attackIndex: selectedIndex,
      },
    };

    if (selectedIndex !== expectedIndex) {
      return {
        isCorrect: false,
        message: `"${targetVariableName}" must attack ${arrayName}[${expectedIndex}], the boss fire.`,
        payload,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload,
    };
  };

export const createStringArrayTraversalValidator =
  ({
    arrayName,
    expectedValues,
    methodName,
    unexpectedVariableMessage,
    successMessage = "Array traversal accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const arrayDeclarations = [
      ...codeWithoutComments.matchAll(STRING_ARRAY_DECLARATION_REGEX),
    ];

    if (arrayDeclarations.length !== 1) {
      return {
        isCorrect: false,
        message: `Declare exactly one string[] array named ${arrayName}.`,
      };
    }

    const [, declaredArrayName, rawItems] = arrayDeclarations[0];
    if (declaredArrayName !== arrayName) {
      return {
        isCorrect: false,
        message:
          unexpectedVariableMessage ??
          `Unexpected array "${declaredArrayName}". Use only "${arrayName}" in this level.`,
      };
    }

    const parsedValues = rawItems
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const match = item.match(QUOTED_STRING_REGEX);
        return match ? match[1] : null;
      });

    if (
      parsedValues.length !== expectedValues.length ||
      parsedValues.some((value) => value === null)
    ) {
      return {
        isCorrect: false,
        message: `"${arrayName}" must contain ${expectedValues.length} quoted string values.`,
        payload: {
          values: { [arrayName]: parsedValues },
        },
      };
    }

    const arrayMatches = expectedValues.every(
      (expectedValue, index) => parsedValues[index] === expectedValue,
    );
    if (!arrayMatches) {
      return {
        isCorrect: false,
        message: `"${arrayName}" must list the names in the correct order.`,
        payload: {
          values: { [arrayName]: parsedValues },
        },
      };
    }

    const loopMatch = codeWithoutComments.match(
      /for\s*\(\s*int\s+([A-Za-z_]\w*)\s*=\s*0\s*;\s*\1\s*<\s*([A-Za-z_]\w*)\s*\.\s*Length\s*;\s*\1\s*\+\+\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!loopMatch) {
      return {
        isCorrect: false,
        message: `Use a for loop that starts at 0, checks ${arrayName}.Length, and increments with i++.`,
        payload: {
          values: { [arrayName]: parsedValues, visitedIndexes: [] },
        },
      };
    }

    const [, indexName, loopArrayName, loopBody] = loopMatch;
    if (loopArrayName !== arrayName) {
      return {
        isCorrect: false,
        message: `The loop condition must use ${arrayName}.Length.`,
        payload: {
          values: { [arrayName]: parsedValues, visitedIndexes: [] },
        },
      };
    }

    const methodCallRegex = new RegExp(
      `\\b${methodName}\\s*\\(\\s*${arrayName}\\s*\\[\\s*${indexName}\\s*\\]\\s*\\)\\s*;`,
    );
    if (!methodCallRegex.test(loopBody)) {
      return {
        isCorrect: false,
        message: `Inside the loop, call ${methodName}(${arrayName}[${indexName}]);`,
        payload: {
          values: { [arrayName]: parsedValues, visitedIndexes: [0] },
        },
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          [arrayName]: parsedValues,
          visitedIndexes: parsedValues.map((_, index) => index),
        },
      },
    };
  };

export const createVoidMethodDefinitionCallValidator =
  ({
    methodName,
    successMessage = "Method definition and call accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const methodDefinitionRegex = new RegExp(
      `\\bstatic\\s+void\\s+${escapedMethodName}\\s*\\(\\s*\\)\\s*\\{[\\s\\S]*?\\}`,
    );

    if (!methodDefinitionRegex.test(codeWithoutComments)) {
      return {
        isCorrect: false,
        message: `Define static void ${methodName}() before calling it.`,
      };
    }

    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1];
    const methodCallRegex = new RegExp(`\\b${escapedMethodName}\\s*\\(\\s*\\)\\s*;`);
    if (!methodCallRegex.test(mainBody)) {
      return {
        isCorrect: false,
        message: `Call ${methodName}(); inside Main.`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { methodName, defined: true, called: true },
      },
    };
  };

export const createRecursiveStairMethodValidator =
  ({
    methodName = "BuildStairs",
    parameterName = "step",
    actionMethodName = "CreateStep",
    expectedArgument = 5,
    successMessage = "Recursive stair ritual accepted.",
  } = {}) =>
  (sourceCode) => {
    const code = stripComments(sourceCode ?? "");
    const escapedMethod = escapeRegex(methodName);
    const escapedParameter = escapeRegex(parameterName);
    const escapedAction = escapeRegex(actionMethodName);
    const methodBody = extractBalancedBody(
      code,
      new RegExp(
        `\\bstatic\\s+void\\s+${escapedMethod}\\s*\\(\\s*int\\s+${escapedParameter}\\s*\\)\\s*\\{`,
      ),
    );

    if (methodBody == null) {
      return {
        isCorrect: false,
        message: `Define static void ${methodName}(int ${parameterName}).`,
        payload: { recursionError: "missingMethod" },
      };
    }

    const baseCaseRegex = new RegExp(
      `\\bif\\s*\\(\\s*${escapedParameter}\\s*(?:==|<=)\\s*0\\s*\\)\\s*(?:\\{\\s*)?return\\s*;`,
    );
    if (!baseCaseRegex.test(methodBody)) {
      return {
        isCorrect: false,
        message: "The ritual has no stopping condition. Add a base case that returns at step 0.",
        payload: { recursionError: "missingBaseCase" },
      };
    }

    const unchangedCallRegex = new RegExp(
      `\\b${escapedMethod}\\s*\\(\\s*${escapedParameter}\\s*\\)\\s*;`,
    );
    if (unchangedCallRegex.test(methodBody)) {
      return {
        isCorrect: false,
        message: "The ritual repeats, but it never moves closer to completion. Subtract 1 from step.",
        payload: { recursionError: "noProgress" },
      };
    }

    const recursiveCallRegex = new RegExp(
      `\\b${escapedMethod}\\s*\\(\\s*${escapedParameter}\\s*-\\s*1\\s*\\)\\s*;`,
    );
    const recursiveCall = recursiveCallRegex.exec(methodBody);
    if (!recursiveCall) {
      return {
        isCorrect: false,
        message: `Call ${methodName}(${parameterName} - 1) so each call moves toward the base case.`,
        payload: { recursionError: "wrongRecursiveCall" },
      };
    }

    const actionRegex = new RegExp(
      `\\b${escapedAction}\\s*\\(\\s*${escapedParameter}\\s*\\)\\s*;`,
    );
    const actionCall = actionRegex.exec(methodBody);
    if (!actionCall) {
      return {
        isCorrect: false,
        message: `Call ${actionMethodName}(${parameterName}) while the recursive calls unwind.`,
        payload: { recursionError: "missingAction" },
      };
    }

    if (actionCall.index < recursiveCall.index) {
      return {
        isCorrect: false,
        message:
          `${actionMethodName} must run after the recursive call so the stairs grow safely from bottom to top.`,
        payload: { recursionError: "wrongOrder" },
      };
    }

    const mainBody = extractBalancedBody(
      code,
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{/,
    );
    if (mainBody == null) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
        payload: { recursionError: "missingMain" },
      };
    }

    const mainCallRegex = new RegExp(
      `\\b${escapedMethod}\\s*\\(\\s*${expectedArgument}\\s*\\)\\s*;`,
    );
    if (!mainCallRegex.test(mainBody)) {
      const attemptedCall = mainBody.match(
        new RegExp(`\\b${escapedMethod}\\s*\\(\\s*(-?\\d+)\\s*\\)\\s*;`),
      );
      return {
        isCorrect: false,
        message: `Call ${methodName}(${expectedArgument}) once inside Main.`,
        payload: {
          recursionError: "missingMainCall",
          attemptedArgument: attemptedCall ? Number(attemptedCall[1]) : null,
        },
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        recursionError: null,
        recursionDepths: Array.from({ length: expectedArgument + 1 }, (_, index) => expectedArgument - index),
        createdSteps: Array.from({ length: expectedArgument }, (_, index) => index + 1),
      },
    };
  };

export const createPredefinedVoidMethodCallValidator =
  ({
    methodName,
    successMessage = "Method call accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );

    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1];
    const methodCallRegex = new RegExp(`\\b${escapedMethodName}\\s*\\(\\s*\\)\\s*;`, "g");
    const calls = [...mainBody.matchAll(methodCallRegex)];
    if (calls.length !== 1) {
      return {
        isCorrect: false,
        message: `Call ${methodName}(); exactly once inside Main.`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { methodName, called: true },
      },
    };
  };

export const createPredefinedVoidMethodArgumentValidator =
  ({
    methodName,
    expectedArgument,
    wrongArgumentMessage,
    successMessage = "Method argument accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );

    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1];
    const anyCallRegex = new RegExp(`\\b${escapedMethodName}\\s*\\(\\s*([^)]*?)\\s*\\)\\s*;`, "g");
    const calls = [...mainBody.matchAll(anyCallRegex)];
    if (calls.length !== 1) {
      return {
        isCorrect: false,
        message: `Call ${methodName}(${expectedArgument}); exactly once inside Main.`,
      };
    }

    const actualArgument = calls[0][1]?.trim();
    if (actualArgument !== String(expectedArgument)) {
      return {
        isCorrect: false,
        message:
          wrongArgumentMessage ??
          `Wrong argument. Call ${methodName}(${expectedArgument});`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { methodName, argument: actualArgument },
      },
    };
  };

export const createVoidMethodBodyCallValidator =
  ({
    methodName,
    requiredBodyPattern,
    requiredBodyStatementLabel,
    successMessage = "Method body and call accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const methodDefinitionRegex = new RegExp(
      `\\bstatic\\s+void\\s+${escapedMethodName}\\s*\\(\\s*\\)\\s*\\{([\\s\\S]*?)\\}`,
    );
    const methodMatch = codeWithoutComments.match(methodDefinitionRegex);

    if (!methodMatch) {
      return {
        isCorrect: false,
        message: `Define static void ${methodName}() before calling it.`,
      };
    }

    const methodBody = methodMatch[1] ?? "";
    const bodyPattern =
      requiredBodyPattern instanceof RegExp
        ? requiredBodyPattern
        : new RegExp(requiredBodyPattern);

    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1];
    if (!bodyPattern.test(methodBody)) {
      if (bodyPattern.test(mainBody)) {
        return {
          isCorrect: false,
          message: `The action is in Main, not inside ${methodName}(). Move ${requiredBodyStatementLabel} into the method body.`,
        };
      }

      return {
        isCorrect: false,
        message: `Put ${requiredBodyStatementLabel} inside ${methodName}().`,
      };
    }

    const methodCallRegex = new RegExp(`\\b${escapedMethodName}\\s*\\(\\s*\\)\\s*;`);
    if (!methodCallRegex.test(mainBody)) {
      return {
        isCorrect: false,
        message: `Call ${methodName}(); inside Main.`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { methodName, hasBody: true, called: true },
      },
    };
  };

export const createVoidMethodParameterCallValidator =
  ({
    methodName,
    parameterType = "int",
    parameterName,
    expectedArgument,
    requiredBodyPattern,
    requiredBodyStatementLabel,
    missingBodyMessage,
    wrongArgumentMessage,
    successMessage = "Parameterized method call accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const escapedParameterType = escapeRegex(parameterType);
    const parameterNamePattern = parameterName
      ? escapeRegex(parameterName)
      : "([A-Za-z_]\\w*)";
    const methodDefinitionRegex = new RegExp(
      `\\bstatic\\s+void\\s+${escapedMethodName}\\s*\\(\\s*${escapedParameterType}\\s+${parameterNamePattern}\\s*\\)\\s*\\{([\\s\\S]*?)\\}`,
    );
    const methodMatch = codeWithoutComments.match(methodDefinitionRegex);

    if (!methodMatch) {
      return {
        isCorrect: false,
        message: `Define static void ${methodName}(${parameterType} ${parameterName ?? "value"}) first.`,
      };
    }

    const methodBody = methodMatch[parameterName ? 1 : 2] ?? "";
    const bodyPattern =
      requiredBodyPattern instanceof RegExp
        ? requiredBodyPattern
        : new RegExp(requiredBodyPattern);
    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1];
    if (!bodyPattern.test(methodBody)) {
      if (bodyPattern.test(mainBody)) {
        return {
          isCorrect: false,
          message:
            missingBodyMessage ??
            `The argument can enter ${methodName}(), but the method body does nothing yet. Move ${requiredBodyStatementLabel} inside ${methodName}().`,
        };
      }

      return {
        isCorrect: false,
        message:
          missingBodyMessage ??
          `${methodName} can receive ${expectedArgument}, but it will not perform the action until ${requiredBodyStatementLabel} is inside the method body.`,
      };
    }

    const anyCallRegex = new RegExp(`\\b${escapedMethodName}\\s*\\(\\s*([^)]*?)\\s*\\)\\s*;`);
    const callMatch = mainBody.match(anyCallRegex);
    if (!callMatch) {
      return {
        isCorrect: false,
        message: `Call ${methodName}(${expectedArgument}); inside Main.`,
      };
    }

    const actualArgument = callMatch[1]?.trim();
    if (actualArgument !== String(expectedArgument)) {
      return {
        isCorrect: false,
        message:
          wrongArgumentMessage ??
          `Wrong argument. Call ${methodName}(${expectedArgument});`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          methodName,
          parameterType,
          parameterName,
          argument: actualArgument,
        },
      },
    };
  };

export const createIntReturnMethodValidator =
  ({
    methodName,
    returnValue,
    variableName,
    successMessage = "Return-value method accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const escapedVariableName = escapeRegex(variableName);

    if (
      new RegExp(`\\bstatic\\s+void\\s+${escapedMethodName}\\s*\\(`).test(
        codeWithoutComments,
      )
    ) {
      return {
        isCorrect: false,
        message: `${methodName} must return int, not void.`,
      };
    }

    const methodDefinitionRegex = new RegExp(
      `\\bstatic\\s+int\\s+${escapedMethodName}\\s*\\(\\s*\\)\\s*\\{([\\s\\S]*?)\\}`,
    );
    const methodMatch = codeWithoutComments.match(methodDefinitionRegex);
    if (!methodMatch) {
      return {
        isCorrect: false,
        message: `Define static int ${methodName}() before calling it.`,
      };
    }

    const methodBody = methodMatch[1] ?? "";
    const returnRegex = new RegExp(`\\breturn\\s+${escapeRegex(String(returnValue))}\\s*;`);
    if (!returnRegex.test(methodBody)) {
      return {
        isCorrect: false,
        message: `${methodName} must return ${returnValue};`,
      };
    }

    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1] ?? "";
    const assignmentRegex = new RegExp(
      `\\bint\\s+${escapedVariableName}\\s*=\\s*${escapedMethodName}\\s*\\(\\s*\\)\\s*;`,
    );
    if (!assignmentRegex.test(mainBody)) {
      if (new RegExp(`\\bint\\s+${escapedVariableName}\\s*=\\s*${returnValue}\\s*;`).test(mainBody)) {
        return {
          isCorrect: false,
          message: `Store the method result, not the literal number: int ${variableName} = ${methodName}();`,
        };
      }

      return {
        isCorrect: false,
        message: `Inside Main, store the returned value with int ${variableName} = ${methodName}();`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          methodName,
          returnValue,
          variableName,
        },
      },
    };
  };

export const createIntParameterReturnMethodValidator =
  ({
    methodName,
    parameters = [],
    returnExpression,
    variableName,
    expectedArguments = [],
    expectedResult = null,
    successMessage = "Parameterized return method accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const escapedVariableName = escapeRegex(variableName);

    if (new RegExp(`\\bstatic\\s+void\\s+${escapedMethodName}\\s*\\(`).test(codeWithoutComments)) {
      return {
        isCorrect: false,
        message: `${methodName} must return int, not void.`,
      };
    }

    const parameterPattern = parameters
      .map(({ type = "int", name }) => `${escapeRegex(type)}\\s+${escapeRegex(name)}`)
      .join("\\s*,\\s*");
    const methodDefinitionRegex = new RegExp(
      `\\bstatic\\s+int\\s+${escapedMethodName}\\s*\\(\\s*${parameterPattern}\\s*\\)\\s*\\{([\\s\\S]*?)\\}`,
    );
    const methodMatch = codeWithoutComments.match(methodDefinitionRegex);
    if (!methodMatch) {
      const signature = parameters.map(({ type = "int", name }) => `${type} ${name}`).join(", ");
      return {
        isCorrect: false,
        message: `Define static int ${methodName}(${signature}) before calling it.`,
      };
    }

    const methodBody = methodMatch[1] ?? "";
    const returnRegex = new RegExp(`\\breturn\\s+${escapeRegex(returnExpression)}\\s*;`);
    if (!returnRegex.test(methodBody.replace(/\s+/g, " "))) {
      return {
        isCorrect: false,
        message: `Return the calculated value with: return ${returnExpression};`,
      };
    }

    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1] ?? "";
    const expectedArgumentText = expectedArguments.map(String).join("\\s*,\\s*");
    const displayArguments = expectedArguments.join(", ");
    const assignmentRegex = new RegExp(
      `\\bint\\s+${escapedVariableName}\\s*=\\s*${escapedMethodName}\\s*\\(\\s*${expectedArgumentText}\\s*\\)\\s*;`,
    );
    if (!assignmentRegex.test(mainBody)) {
      const expectedLiteralResult = expectedResult ?? (expectedArguments.every((value) => Number.isFinite(Number(value)))
        ? expectedArguments.reduce((sum, value) => sum + Number(value), 0)
        : null);
      if (
        expectedLiteralResult !== null &&
        new RegExp(`\\bint\\s+${escapedVariableName}\\s*=\\s*${escapeRegex(String(expectedLiteralResult))}\\s*;`).test(mainBody)
      ) {
        return {
          isCorrect: false,
          message: `The shield needs a returned value, not a typed final answer. Store ${methodName}(${displayArguments}) in ${variableName}.`,
        };
      }

      return {
        isCorrect: false,
        message: `Store the result with int ${variableName} = ${methodName}(${displayArguments});`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          methodName,
          variableName,
          arguments: expectedArguments,
        },
      },
    };
  };

export const createStringReturnMethodValidator =
  ({
    methodName,
    returnValue,
    variableName,
    successMessage = "String return-value method accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const escapedVariableName = escapeRegex(variableName);
    const escapedReturnValue = escapeRegex(returnValue);

    if (
      new RegExp(`\\bstatic\\s+void\\s+${escapedMethodName}\\s*\\(`).test(
        codeWithoutComments,
      )
    ) {
      return {
        isCorrect: false,
        message: `${methodName} must return string, not void.`,
      };
    }

    const methodDefinitionRegex = new RegExp(
      `\\bstatic\\s+(?:string|String)\\s+${escapedMethodName}\\s*\\(\\s*\\)\\s*\\{([\\s\\S]*?)\\}`,
    );
    const methodMatch = codeWithoutComments.match(methodDefinitionRegex);
    if (!methodMatch) {
      return {
        isCorrect: false,
        message: `Define static string ${methodName}() before calling it.`,
      };
    }

    const methodBody = methodMatch[1] ?? "";
    const returnRegex = new RegExp(`\\breturn\\s+"${escapedReturnValue}"\\s*;`);
    if (!returnRegex.test(methodBody)) {
      return {
        isCorrect: false,
        message: `${methodName} must return "${returnValue}";`,
      };
    }

    const mainMatch = codeWithoutComments.match(
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!mainMatch) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
      };
    }

    const mainBody = mainMatch[1] ?? "";
    const assignmentRegex = new RegExp(
      `\\b(?:string|String)\\s+${escapedVariableName}\\s*=\\s*${escapedMethodName}\\s*\\(\\s*\\)\\s*;`,
    );
    if (!assignmentRegex.test(mainBody)) {
      if (new RegExp(`\\b(?:string|String)\\s+${escapedVariableName}\\s*=\\s*"${escapedReturnValue}"\\s*;`).test(mainBody)) {
        return {
          isCorrect: false,
          message: `Store the method result, not the literal word: string ${variableName} = ${methodName}();`,
        };
      }

      return {
        isCorrect: false,
        message: `Inside Main, store the returned value with string ${variableName} = ${methodName}();`,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          methodName,
          returnValue,
          variableName,
        },
      },
    };
  };

export const createIntegerArrayCountValidator =
  ({
    arrayName,
    expectedValues,
    counterName,
    targetValue,
    successMessage = "Array count accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const arrayDeclarations = [
      ...codeWithoutComments.matchAll(INT_ARRAY_DECLARATION_REGEX),
    ];

    if (arrayDeclarations.length !== 1) {
      return {
        isCorrect: false,
        message: `Declare exactly one int[] array named ${arrayName}.`,
      };
    }

    const [, declaredArrayName, rawItems] = arrayDeclarations[0];
    const parsedValues = rawItems
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number);
    const basePayload = {
      values: { [arrayName]: parsedValues, [counterName]: 0, visitedIndexes: [] },
    };

    if (declaredArrayName !== arrayName) {
      return {
        isCorrect: false,
        message: `Name the integer array ${arrayName}.`,
        payload: basePayload,
      };
    }

    if (
      parsedValues.length !== expectedValues.length ||
      parsedValues.some((value) => !Number.isInteger(value)) ||
      !expectedValues.every((value, index) => parsedValues[index] === value)
    ) {
      return {
        isCorrect: false,
        message: `${arrayName} must contain { ${expectedValues.join(", ")} } in that order.`,
        payload: basePayload,
      };
    }

    const counterRegex = new RegExp(`\\bint\\s+${counterName}\\s*=\\s*0\\s*;`);
    if (!counterRegex.test(codeWithoutComments)) {
      return {
        isCorrect: false,
        message: `Initialize the counter with int ${counterName} = 0;`,
        payload: basePayload,
      };
    }

    const loopMatch = codeWithoutComments.match(
      /for\s*\(\s*int\s+([A-Za-z_]\w*)\s*=\s*0\s*;\s*\1\s*<\s*([A-Za-z_]\w*)\s*\.\s*Length\s*;\s*\1\s*\+\+\s*\)\s*\{([\s\S]*?)\}/,
    );
    if (!loopMatch) {
      return {
        isCorrect: false,
        message: `Traverse ${arrayName} from index 0 using ${arrayName}.Length and i++.`,
        payload: basePayload,
      };
    }

    const [, indexName, loopArrayName] = loopMatch;
    if (loopArrayName !== arrayName) {
      return {
        isCorrect: false,
        message: `The loop condition must use ${arrayName}.Length.`,
        payload: basePayload,
      };
    }

    const conditionRegex = new RegExp(
      `if\\s*\\(\\s*${arrayName}\\s*\\[\\s*${indexName}\\s*\\]\\s*==\\s*${targetValue}\\s*\\)\\s*\\{([\\s\\S]*?)\\}`,
    );
    const conditionMatch = codeWithoutComments.match(conditionRegex);
    if (!conditionMatch) {
      return {
        isCorrect: false,
        message: `Inside the loop, check if (${arrayName}[${indexName}] == ${targetValue}).`,
        payload: {
          values: {
            ...basePayload.values,
            visitedIndexes: parsedValues.map((_, index) => index),
          },
        },
      };
    }

    const incrementRegex = new RegExp(`\\b${counterName}\\s*\\+\\+\\s*;`);
    if (!incrementRegex.test(conditionMatch[1])) {
      return {
        isCorrect: false,
        message: `Increment ${counterName} inside the if block.`,
        payload: {
          values: {
            ...basePayload.values,
            visitedIndexes: parsedValues.map((_, index) => index),
          },
        },
      };
    }

    const count = parsedValues.filter((value) => value === targetValue).length;
    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          [arrayName]: parsedValues,
          [counterName]: count,
          visitedIndexes: parsedValues.map((_, index) => index),
        },
      },
    };
  };

export const createCursedCharmCountMethodValidator =
  ({
    methodName = "CountCursed",
    parameterName = "charms",
    arrayName = "charms",
    counterName = "count",
    resultName = "cursedCount",
    expectedValues = [1, 0, 1, 1, 0, 1],
    targetValue = 0,
    successMessage = "Cursed charm count accepted.",
  } = {}) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethodName = escapeRegex(methodName);
    const escapedParameterName = escapeRegex(parameterName);
    const escapedArrayName = escapeRegex(arrayName);
    const escapedCounterName = escapeRegex(counterName);
    const baseValues = {
      [arrayName]: [],
      [resultName]: 0,
      visitedIndexes: [],
    };

    if (
      new RegExp(`\\bstatic\\s+void\\s+${escapedMethodName}\\s*\\(`).test(
        codeWithoutComments,
      )
    ) {
      return {
        isCorrect: false,
        message: `${methodName} must return int, not void.`,
        payload: { values: baseValues },
      };
    }

    const signatureRegex = new RegExp(
      `\\bstatic\\s+int\\s+${escapedMethodName}\\s*\\(\\s*int\\s*\\[\\s*\\]\\s+${escapedParameterName}\\s*\\)`,
    );
    const methodBody = extractBalancedBody(codeWithoutComments, signatureRegex);
    if (methodBody === null) {
      return {
        isCorrect: false,
        message: `Define static int ${methodName}(int[] ${parameterName}).`,
        payload: { values: baseValues },
      };
    }

    if (!new RegExp(`\\bint\\s+${escapedCounterName}\\s*=\\s*0\\s*;`).test(methodBody)) {
      return {
        isCorrect: false,
        message: `Start the count with int ${counterName} = 0;`,
        payload: { values: baseValues },
      };
    }

    const loopSignature =
      /for\s*\(\s*int\s+([A-Za-z_]\w*)\s*=\s*0\s*;\s*\1\s*<\s*([A-Za-z_]\w*)\s*\.\s*Length\s*;\s*\1\s*\+\+\s*\)/;
    const loopMatch = methodBody.match(loopSignature);
    if (!loopMatch || loopMatch[2] !== parameterName) {
      const fixedBoundLoop = methodBody.match(
        /for\s*\(\s*int\s+([A-Za-z_]\w*)\s*=\s*0\s*;\s*\1\s*<\s*(\d+)\s*;\s*\1\s*\+\+\s*\)/,
      );
      const visitedCount = fixedBoundLoop
        ? Math.min(Number(fixedBoundLoop[2]), expectedValues.length)
        : 0;
      return {
        isCorrect: false,
        message: `Loop from index 0 while i < ${parameterName}.Length, then use i++.`,
        payload: {
          values: {
            ...baseValues,
            [arrayName]: expectedValues,
            visitedIndexes: Array.from(
              { length: visitedCount },
              (_, index) => index,
            ),
          },
        },
      };
    }

    const indexName = loopMatch[1];
    const loopBody = extractBalancedBody(methodBody, new RegExp(loopSignature.source));
    if (loopBody === null) {
      return {
        isCorrect: false,
        message: "Put the array inspection inside the for loop braces.",
        payload: { values: baseValues },
      };
    }
    const conditionRegex = new RegExp(
      `if\\s*\\(\\s*(?:${escapedParameterName}\\s*\\[\\s*${escapeRegex(indexName)}\\s*\\]\\s*==\\s*${targetValue}|${targetValue}\\s*==\\s*${escapedParameterName}\\s*\\[\\s*${escapeRegex(indexName)}\\s*\\])\\s*\\)`,
    );
    const conditionBody = extractBalancedBody(loopBody, conditionRegex);
    if (conditionBody === null) {
      return {
        isCorrect: false,
        message: `Inside the loop, check if (${parameterName}[${indexName}] == ${targetValue}).`,
        payload: { values: baseValues },
      };
    }

    if (!new RegExp(`\\b${escapedCounterName}\\s*\\+\\+\\s*;`).test(conditionBody)) {
      return {
        isCorrect: false,
        message: `Increment ${counterName} when a cursed charm is found.`,
        payload: { values: baseValues },
      };
    }

    if (!new RegExp(`\\breturn\\s+${escapedCounterName}\\s*;`).test(methodBody)) {
      return {
        isCorrect: false,
        message: `Return the finished counter with return ${counterName};`,
        payload: { values: baseValues },
      };
    }

    const mainBody = extractBalancedBody(
      codeWithoutComments,
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+args\s*\)/,
    );
    if (mainBody === null) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the program.",
        payload: { values: baseValues },
      };
    }

    const declarations = [...mainBody.matchAll(INT_ARRAY_DECLARATION_REGEX)];
    const arrayDeclaration = declarations.find((match) => match[1] === arrayName);
    if (!arrayDeclaration) {
      return {
        isCorrect: false,
        message: `Inside Main, declare int[] ${arrayName} = { ${expectedValues.join(", ")} };`,
        payload: { values: baseValues },
      };
    }

    const parsedValues = arrayDeclaration[2]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number);
    const payloadValues = {
      [arrayName]: parsedValues,
      [resultName]: 0,
      visitedIndexes: [],
    };
    if (
      parsedValues.length !== expectedValues.length ||
      parsedValues.some((value) => !Number.isInteger(value)) ||
      !expectedValues.every((value, index) => parsedValues[index] === value)
    ) {
      return {
        isCorrect: false,
        message: `${arrayName} must contain { ${expectedValues.join(", ")} } in that order.`,
        payload: { values: payloadValues },
      };
    }

    const assignmentRegex = new RegExp(
      `\\bint\\s+${escapeRegex(resultName)}\\s*=\\s*${escapedMethodName}\\s*\\(\\s*${escapedArrayName}\\s*\\)\\s*;`,
    );
    if (!assignmentRegex.test(mainBody)) {
      return {
        isCorrect: false,
        message: `Store the returned count with int ${resultName} = ${methodName}(${arrayName});`,
        payload: {
          values: {
            ...payloadValues,
            visitedIndexes: parsedValues.map((_, index) => index),
          },
        },
      };
    }

    const count = parsedValues.filter((value) => value === targetValue).length;
    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          [arrayName]: parsedValues,
          [resultName]: count,
          visitedIndexes: parsedValues.map((_, index) => index),
        },
      },
    };
  };

export const createExactInteger2DArrayDeclarationValidator =
  ({
    variableName,
    expectedRows,
    unexpectedVariableMessage,
    successMessage = "2D array declaration accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const arrayDeclarations = [
      ...codeWithoutComments.matchAll(INT_2D_ARRAY_DECLARATION_REGEX),
    ];
    const scalarDeclarations = [...codeWithoutComments.matchAll(DECLARATION_REGEX)];
    const oneDimensionalArrays = [
      ...codeWithoutComments.matchAll(INT_ARRAY_DECLARATION_REGEX),
    ];

    if (
      arrayDeclarations.length !== 1 ||
      scalarDeclarations.length > 0 ||
      oneDimensionalArrays.length > 0
    ) {
      return {
        isCorrect: false,
        message: `Declare exactly one 2D int array: int[,] ${variableName} = { ... };`,
      };
    }

    const [, declaredName, rawRows] = arrayDeclarations[0];
    if (declaredName !== variableName) {
      return {
        isCorrect: false,
        message:
          unexpectedVariableMessage ??
          `Unexpected array "${declaredName}". Use only "${variableName}" in this level.`,
      };
    }

    const rowMatches = [...rawRows.matchAll(/\{([^{}]*)\}/g)];
    if (rowMatches.length !== expectedRows.length) {
      return {
        isCorrect: false,
        message: `"${variableName}" must contain ${expectedRows.length} rows.`,
      };
    }

    const parsedRows = [];
    for (const rowMatch of rowMatches) {
      const values = rowMatch[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const expectedColumnCount = expectedRows[0]?.length ?? 0;
      if (values.length !== expectedColumnCount) {
        return {
          isCorrect: false,
          message: `"${variableName}" must have ${expectedColumnCount} columns in every row.`,
        };
      }

      const parsedValues = [];
      for (const value of values) {
        if (!INTEGER_LITERAL_REGEX.test(value)) {
          return {
            isCorrect: false,
            message: `"${variableName}" must contain only integer literals.`,
          };
        }
        parsedValues.push(Number.parseInt(value, 10));
      }
      parsedRows.push(parsedValues);
    }

    const matches = expectedRows.every((expectedRow, rowIndex) =>
      expectedRow.every(
        (expectedValue, columnIndex) =>
          parsedRows[rowIndex]?.[columnIndex] === expectedValue,
      ),
    );

    if (!matches) {
      return {
        isCorrect: false,
        message: `"${variableName}" must match the required ward pattern.`,
        payload: {
          values: { [variableName]: parsedRows },
        },
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: { [variableName]: parsedRows },
      },
    };
  };

export const createVoidMethodIntegerArrayParameterValidator =
  ({
    methodName,
    parameterName,
    arrayName,
    expectedValues,
    successMessage = "Array method accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethod = escapeRegex(methodName);
    const escapedParameter = escapeRegex(parameterName);
    const methodBody = extractBalancedBody(
      codeWithoutComments,
      new RegExp(
        `\\bstatic\\s+void\\s+${escapedMethod}\\s*\\(\\s*int\\s*\\[\\s*\\]\\s+${escapedParameter}\\s*\\)\\s*\\{`,
      ),
    );

    if (methodBody === null) {
      return {
        isCorrect: false,
        message: `Define static void ${methodName}(int[] ${parameterName}).`,
      };
    }

    const mainBody = extractBalancedBody(
      codeWithoutComments,
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+\w+\s*\)\s*\{/,
    );
    if (mainBody === null) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the Program class.",
      };
    }

    const declarations = [...mainBody.matchAll(INT_ARRAY_DECLARATION_REGEX)];
    const declaration = declarations.find((match) => match[1] === arrayName);
    if (!declaration) {
      return {
        isCorrect: false,
        message: `Inside Main, declare int[] ${arrayName}.`,
      };
    }

    const values = declaration[2]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number);
    const expectedMatches =
      values.length === expectedValues.length &&
      values.every(
        (value, index) =>
          Number.isInteger(value) && value === expectedValues[index],
      );
    const payload = {
      values: {
        [arrayName]: values,
        methodName,
        called: false,
      },
    };

    if (!expectedMatches) {
      return {
        isCorrect: false,
        message: `${arrayName} must contain { ${expectedValues.join(", ")} } in order.`,
        payload,
      };
    }

    const callRegex = new RegExp(
      `\\b${escapedMethod}\\s*\\(\\s*${escapeRegex(arrayName)}\\s*\\)\\s*;`,
    );
    if (!callRegex.test(mainBody)) {
      return {
        isCorrect: false,
        message: `Pass the whole array with ${methodName}(${arrayName});`,
        payload,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          [arrayName]: values,
          methodName,
          called: true,
        },
      },
    };
  };

export const createVoidMethodInteger2DArrayParameterValidator =
  ({
    methodName,
    parameterName,
    arrayName,
    expectedRows,
    mismatchMessage,
    successMessage = "2D array method accepted.",
  }) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethod = escapeRegex(methodName);
    const escapedParameter = escapeRegex(parameterName);
    const escapedArray = escapeRegex(arrayName);
    const basePayload = {
      values: {
        [arrayName]: [],
        methodName,
        called: false,
      },
    };

    if (/\bint\s*\[\s*\]\s*\[\s*\]/.test(codeWithoutComments)) {
      return {
        isCorrect: false,
        message: "Use a rectangular int[,] array here, not int[][].",
        payload: basePayload,
      };
    }

    const methodBody = extractBalancedBody(
      codeWithoutComments,
      new RegExp(
        `\\bstatic\\s+void\\s+${escapedMethod}\\s*\\(\\s*int\\s*\\[\\s*,\\s*\\]\\s+${escapedParameter}\\s*\\)\\s*\\{`,
      ),
    );
    if (methodBody === null) {
      return {
        isCorrect: false,
        message: `Define static void ${methodName}(int[,] ${parameterName}).`,
        payload: basePayload,
      };
    }

    const mainBody = extractBalancedBody(
      codeWithoutComments,
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+\w+\s*\)\s*\{/,
    );
    if (mainBody === null) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the Program class.",
        payload: basePayload,
      };
    }

    const declarations = [...mainBody.matchAll(INT_2D_ARRAY_DECLARATION_REGEX)];
    const declaration = declarations.find((match) => match[1] === arrayName);
    if (!declaration) {
      return {
        isCorrect: false,
        message: `Inside Main, declare int[,] ${arrayName} with two rows and two columns.`,
        payload: basePayload,
      };
    }

    const parsedRows = [...declaration[2].matchAll(/\{([^{}]*)\}/g)].map(
      (rowMatch) =>
        rowMatch[1]
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map(Number),
    );
    const payload = {
      values: {
        [arrayName]: parsedRows,
        methodName,
        called: false,
      },
    };
    const matchesExpected =
      parsedRows.length === expectedRows.length &&
      expectedRows.every(
        (expectedRow, rowIndex) =>
          parsedRows[rowIndex]?.length === expectedRow.length &&
          expectedRow.every(
            (expectedValue, columnIndex) =>
              Number.isInteger(parsedRows[rowIndex]?.[columnIndex]) &&
              parsedRows[rowIndex][columnIndex] === expectedValue,
          ),
      );
    if (!matchesExpected) {
      return {
        isCorrect: false,
        message:
          mismatchMessage ||
          `${arrayName} does not match the required two-dimensional pattern.`,
        payload,
      };
    }

    const callRegex = new RegExp(
      `\\b${escapedMethod}\\s*\\(\\s*${escapedArray}\\s*\\)\\s*;`,
    );
    if (!callRegex.test(mainBody)) {
      return {
        isCorrect: false,
        message: `Pass the complete grid with ${methodName}(${arrayName});`,
        payload,
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: {
        values: {
          [arrayName]: parsedRows,
          methodName,
          called: true,
        },
      },
    };
  };

export const createBlessedGraveCount2DMethodValidator =
  ({
    methodName = "CountBlessedGraves",
    parameterName = "graves",
    arrayName = "graves",
    counterName = "blessed",
    resultName = "blessed",
    expectedRows = [
      [1, 0, 1, 1],
      [0, 1, 0, 1],
      [1, 1, 0, 0],
    ],
    targetValue = 1,
    successMessage = "Blessed graves counted.",
  } = {}) =>
  (sourceCode) => {
    const codeWithoutComments = stripComments(sourceCode ?? "");
    const escapedMethod = escapeRegex(methodName);
    const escapedParameter = escapeRegex(parameterName);
    const escapedArray = escapeRegex(arrayName);
    const escapedCounter = escapeRegex(counterName);
    const emptyValues = {
      [arrayName]: [],
      [resultName]: 0,
      visitedCells: [],
    };

    if (/\bint\s*\[\s*\]\s*\[\s*\]/.test(codeWithoutComments)) {
      return {
        isCorrect: false,
        message: "Use one rectangular int[,] array, not int[][] here.",
        payload: { values: emptyValues },
      };
    }

    const methodBody = extractBalancedBody(
      codeWithoutComments,
      new RegExp(
        `\\bstatic\\s+int\\s+${escapedMethod}\\s*\\(\\s*int\\s*\\[\\s*,\\s*\\]\\s+${escapedParameter}\\s*\\)`,
      ),
    );
    if (methodBody === null) {
      return {
        isCorrect: false,
        message: `Define static int ${methodName}(int[,] ${parameterName}).`,
        payload: { values: emptyValues },
      };
    }

    if (!new RegExp(`\\bint\\s+${escapedCounter}\\s*=\\s*0\\s*;`).test(methodBody)) {
      return {
        isCorrect: false,
        message: `Start the blessed-spirit count with int ${counterName} = 0;`,
        payload: { values: { ...emptyValues, failureType: "missing_counter" } },
      };
    }

    const outerLoopRegex = new RegExp(
      `for\\s*\\(\\s*int\\s+([A-Za-z_]\\w*)\\s*=\\s*0\\s*;\\s*\\1\\s*<\\s*${escapedParameter}\\s*\\.\\s*GetLength\\s*\\(\\s*0\\s*\\)\\s*;\\s*\\1\\s*\\+\\+\\s*\\)`,
    );
    const outerMatch = methodBody.match(outerLoopRegex);
    const outerBody = extractBalancedBody(methodBody, outerLoopRegex);
    if (!outerMatch || outerBody === null) {
      return {
        isCorrect: false,
        message: `Use an outer loop from 0 to ${parameterName}.GetLength(0).`,
        payload: { values: { ...emptyValues, failureType: "missing_outer_loop" } },
      };
    }

    const innerLoopRegex = new RegExp(
      `for\\s*\\(\\s*int\\s+([A-Za-z_]\\w*)\\s*=\\s*0\\s*;\\s*\\1\\s*<\\s*${escapedParameter}\\s*\\.\\s*GetLength\\s*\\(\\s*1\\s*\\)\\s*;\\s*\\1\\s*\\+\\+\\s*\\)`,
    );
    const innerMatch = outerBody.match(innerLoopRegex);
    const innerBody = extractBalancedBody(outerBody, innerLoopRegex);
    if (!innerMatch || innerBody === null) {
      return {
        isCorrect: false,
        message: `Inside it, loop from 0 to ${parameterName}.GetLength(1).`,
        payload: { values: { ...emptyValues, failureType: "missing_inner_loop" } },
      };
    }

    const rowName = outerMatch[1];
    const columnName = innerMatch[1];
    const cellAccess =
      `${escapedParameter}\\s*\\[\\s*${escapeRegex(rowName)}\\s*,\\s*${escapeRegex(columnName)}\\s*\\]`;
    const corruptedCondition = new RegExp(
      `if\\s*\\(\\s*(?:${cellAccess}\\s*==\\s*0|0\\s*==\\s*${cellAccess})\\s*\\)`,
    );
    if (extractBalancedBody(innerBody, corruptedCondition) !== null) {
      return {
        isCorrect: false,
        message: "A value of 0 marks a corrupted grave. Count only blessed graves whose value is 1.",
        payload: { values: { ...emptyValues, failureType: "counting_corrupted" } },
      };
    }
    const blessedCondition = new RegExp(
      `if\\s*\\(\\s*(?:${cellAccess}\\s*==\\s*${targetValue}|${targetValue}\\s*==\\s*${cellAccess})\\s*\\)`,
    );
    const conditionBody = extractBalancedBody(innerBody, blessedCondition);
    if (conditionBody === null) {
      return {
        isCorrect: false,
        message: `Inspect each grave with ${parameterName}[${rowName}, ${columnName}] and count only values equal to ${targetValue}.`,
        payload: { values: { ...emptyValues, failureType: "wrong_access" } },
      };
    }
    if (!new RegExp(`\\b${escapedCounter}\\s*\\+\\+\\s*;`).test(conditionBody)) {
      return {
        isCorrect: false,
        message: `Increment ${counterName} inside the blessed-grave if block.`,
        payload: { values: { ...emptyValues, failureType: "missing_increment" } },
      };
    }
    if (!new RegExp(`\\breturn\\s+${escapedCounter}\\s*;`).test(methodBody)) {
      return {
        isCorrect: false,
        message: `Return the final count with return ${counterName};`,
        payload: { values: { ...emptyValues, failureType: "missing_return" } },
      };
    }

    const mainBody = extractBalancedBody(
      codeWithoutComments,
      /\bstatic\s+void\s+Main\s*\(\s*string\s*\[\s*\]\s+\w+\s*\)/,
    );
    if (mainBody === null) {
      return {
        isCorrect: false,
        message: "Keep static void Main(string[] args) in the Program class.",
        payload: { values: emptyValues },
      };
    }

    const declarations = [...mainBody.matchAll(INT_2D_ARRAY_DECLARATION_REGEX)];
    const declaration = declarations.find((match) => match[1] === arrayName);
    if (!declaration) {
      return {
        isCorrect: false,
        message: `Inside Main, declare the shown cemetery as int[,] ${arrayName}.`,
        payload: { values: emptyValues },
      };
    }
    const parsedRows = [...declaration[2].matchAll(/\{([^{}]*)\}/g)].map(
      (rowMatch) =>
        rowMatch[1]
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map(Number),
    );
    const matrixMatches =
      parsedRows.length === expectedRows.length &&
      expectedRows.every(
        (expectedRow, rowIndex) =>
          parsedRows[rowIndex]?.length === expectedRow.length &&
          expectedRow.every(
            (expectedValue, columnIndex) =>
              parsedRows[rowIndex][columnIndex] === expectedValue,
          ),
      );
    const visitedCells = parsedRows.flatMap((row, rowIndex) =>
      row.map((_, columnIndex) => [rowIndex, columnIndex]),
    );
    const count = parsedRows.flat().filter((value) => value === targetValue).length;
    const values = {
      [arrayName]: parsedRows,
      [resultName]: count,
      visitedCells,
    };
    if (!matrixMatches) {
      return {
        isCorrect: false,
        message: "Copy the displayed 3 by 4 grave pattern exactly: 1 is blessed and 0 is corrupted.",
        payload: { values: { ...values, failureType: "wrong_dimensions" } },
      };
    }

    const assignmentRegex = new RegExp(
      `\\bint\\s+${escapeRegex(resultName)}\\s*=\\s*${escapedMethod}\\s*\\(\\s*${escapedArray}\\s*\\)\\s*;`,
    );
    if (!assignmentRegex.test(mainBody)) {
      return {
        isCorrect: false,
        message: `Store the result with int ${resultName} = ${methodName}(${arrayName});`,
        payload: { values },
      };
    }

    return {
      isCorrect: true,
      message: successMessage,
      payload: { values },
    };
  };
