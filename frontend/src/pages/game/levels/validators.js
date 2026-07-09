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
