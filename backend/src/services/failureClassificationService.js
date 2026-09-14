const FAILURE_CATEGORIES = Object.freeze({
  COMPILATION: "compilation",
  SYNTAX: "syntax",
  LOGIC: "wrong_logic",
  OUTPUT: "incorrect_output",
  STRUCTURE: "structure_requirement",
  INCOMPLETE: "incomplete_solution",
  UNKNOWN: "unknown",
});

const result = (failureCode, category, metadata = {}) => ({
  failureCode,
  category,
  metadata,
});

const stripCommentsAndStrings = (sourceCode) => String(sourceCode ?? "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "")
  .replace(/@?"(?:""|\\.|[^"\\])*"/g, '""')
  .replace(/'(?:\\.|[^'\\])'/g, "''");

const findDelimiterProblem = (sourceCode) => {
  const source = stripCommentsAndStrings(sourceCode);
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const character of source) {
    if (character === "(" || character === "[" || character === "{") {
      stack.push(character);
    } else if (pairs[character]) {
      if (stack.pop() !== pairs[character]) return character;
    }
  }
  return stack.pop() ?? null;
};

const findLikelyMissingSemicolon = (sourceCode) => {
  const lines = String(sourceCode ?? "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\/\/.*$/, "").trim();
    if (!line || /[;{}:]$/.test(line)) continue;
    const declaration = /^(?:int|string|double|float|bool)(?:\s*\[\s*,?\s*\])?\s+[A-Za-z_]\w*\s*=.+/;
    const statement = /^(?:return\s+.+|[A-Za-z_]\w*\s*(?:\+\+|--|=.*)|[A-Za-z_]\w*\s*\([^)]*\))$/;
    if (declaration.test(line) || statement.test(line)) return index + 1;
  }
  return null;
};

const classifyCompilerDiagnostic = (compilerResult) => {
  const diagnostic = String(
    compilerResult?.stderr ?? compilerResult?.message ?? compilerResult?.diagnostic ?? "",
  );
  if (!diagnostic || (compilerResult?.errorType !== "compiler" && !/\bCS\d{4}\b/.test(diagnostic))) {
    return null;
  }
  const compilerCode = diagnostic.match(/\bCS\d{4}\b/)?.[0] ?? null;
  if (/CS1002|; expected/i.test(diagnostic)) {
    return result("COMPILER_MISSING_SEMICOLON", FAILURE_CATEGORIES.SYNTAX, { compilerCode });
  }
  if (/CS0103|does not exist in the current context/i.test(diagnostic)) {
    return result("COMPILER_UNKNOWN_NAME", FAILURE_CATEGORIES.COMPILATION, { compilerCode });
  }
  if (/CS0029|cannot implicitly convert/i.test(diagnostic)) {
    return result("COMPILER_TYPE_MISMATCH", FAILURE_CATEGORIES.COMPILATION, { compilerCode });
  }
  if (/CS1026|CS1513|\)|} expected/i.test(diagnostic)) {
    return result("COMPILER_UNMATCHED_DELIMITER", FAILURE_CATEGORIES.SYNTAX, { compilerCode });
  }
  if (/CS1501|CS1503|argument/i.test(diagnostic)) {
    return result("COMPILER_INVALID_METHOD_USAGE", FAILURE_CATEGORIES.COMPILATION, { compilerCode });
  }
  return result("COMPILER_ERROR", FAILURE_CATEGORIES.COMPILATION, { compilerCode });
};

const classifySyntax = (sourceCode) => {
  if (typeof sourceCode !== "string" || !sourceCode.trim()) {
    return result("INCOMPLETE_SOLUTION", FAILURE_CATEGORIES.INCOMPLETE);
  }
  const delimiter = findDelimiterProblem(sourceCode);
  if (delimiter) {
    return result("COMPILER_UNMATCHED_DELIMITER", FAILURE_CATEGORIES.SYNTAX, { delimiter });
  }
  const line = findLikelyMissingSemicolon(sourceCode);
  if (line) {
    return result("COMPILER_MISSING_SEMICOLON", FAILURE_CATEGORIES.SYNTAX, { line });
  }
  return null;
};

const TYPE_FALLBACKS = Object.freeze({
  singleInteger: ["WRONG_VALUE", FAILURE_CATEGORIES.LOGIC],
  exactGoal: ["WRONG_VALUE", FAILURE_CATEGORIES.LOGIC],
  multiString: ["INCOMPLETE_SOLUTION", FAILURE_CATEGORIES.INCOMPLETE],
  exactIntegerArray: ["WRONG_ARRAY_VALUES", FAILURE_CATEGORIES.LOGIC],
  exactStringArray: ["WRONG_ARRAY_VALUES", FAILURE_CATEGORIES.LOGIC],
  exactInteger2DArray: ["WRONG_ARRAY_VALUES", FAILURE_CATEGORIES.LOGIC],
  stringArrayAccess: ["WRONG_ARRAY_INDEX", FAILURE_CATEGORIES.LOGIC],
  stringArrayTraversal: ["WRONG_LOOP_BOUNDS", FAILURE_CATEGORIES.LOGIC],
  predefinedVoidMethodCall: ["MISSING_METHOD_CALL", FAILURE_CATEGORIES.STRUCTURE],
  predefinedVoidMethodArgument: ["WRONG_ARGUMENT", FAILURE_CATEGORIES.LOGIC],
  voidMethodDefinitionCall: ["MISSING_METHOD", FAILURE_CATEGORIES.STRUCTURE],
  voidMethodParameterCall: ["WRONG_METHOD_SIGNATURE", FAILURE_CATEGORIES.STRUCTURE],
  intReturnMethod: ["WRONG_RETURN_VALUE", FAILURE_CATEGORIES.LOGIC],
  intParameterReturnMethod: ["WRONG_RETURN_VALUE", FAILURE_CATEGORIES.LOGIC],
  stringReturnMethod: ["WRONG_RETURN_VALUE", FAILURE_CATEGORIES.LOGIC],
  cursedCharmCountMethod: ["WRONG_CONDITION", FAILURE_CATEGORIES.LOGIC],
  recursiveStairMethod: ["WRONG_RECURSIVE_STEP", FAILURE_CATEGORIES.LOGIC],
  voidMethodIntegerArrayParameter: ["WRONG_METHOD_SIGNATURE", FAILURE_CATEGORIES.STRUCTURE],
  voidMethodInteger2DArrayParameter: ["WRONG_METHOD_SIGNATURE", FAILURE_CATEGORIES.STRUCTURE],
  blessedGraveCount2DMethod: ["WRONG_LOOP_BOUNDS", FAILURE_CATEGORIES.LOGIC],
  bakunawaFinale: ["INCOMPLETE_SOLUTION", FAILURE_CATEGORIES.INCOMPLETE],
});

const MESSAGE_RULES = [
  [/(?:typed|hardcod(?:e|ed)|literal).*(?:answer|result|word|number)|store the method result, not/i, "HARDCODED_RESULT", FAILURE_CATEGORIES.STRUCTURE],
  [/must get its value from .*\[index\]/i, "HARDCODED_RESULT", FAILURE_CATEGORIES.STRUCTURE],
  [/int\s*\[\s*\]\s*\[\s*\]|not int\[\]\[\]/i, "WRONG_ARRAY_TYPE", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:row|column|dimension|\d\s*(?:by|x)\s*\d)/i, "WRONG_ARRAY_DIMENSIONS", FAILURE_CATEGORIES.LOGIC],
  [/(?:array|grid|pattern).*(?:contain|match|order|shown)|does not match/i, "WRONG_ARRAY_VALUES", FAILURE_CATEGORIES.LOGIC],
  [/(?:index|array inspection|\[[A-Za-z_]?i\]|current element)/i, "WRONG_ARRAY_INDEX", FAILURE_CATEGORIES.LOGIC],
  [/(?:outer loop|inner loop|loop from|traverse).*(?:Length|GetLength|index 0)|loop condition.*Length/i, "WRONG_LOOP_BOUNDS", FAILURE_CATEGORIES.LOGIC],
  [/(?:for loop|loop).*missing|use a .*loop/i, "MISSING_REQUIRED_CONSTRUCT", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:increment|\+\+)/i, "MISSING_INCREMENT", FAILURE_CATEGORIES.LOGIC],
  [/(?:inside the loop,? check|count only|condition|equal to|==)/i, "WRONG_CONDITION", FAILURE_CATEGORIES.LOGIC],
  [/must return (?:int|string), not void|return type/i, "WRONG_RETURN_TYPE", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:return the|must return|returned count|return the final)/i, "WRONG_RETURN_VALUE", FAILURE_CATEGORIES.LOGIC],
  [/(?:define static|method is missing|define .* before calling)/i, "MISSING_METHOD", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:parameter|signature)/i, "WRONG_METHOD_SIGNATURE", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:call|invoke|pass the whole|pass the complete|store the result|store the returned)/i, "MISSING_METHOD_CALL", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:argument|asks for|marker)/i, "WRONG_ARGUMENT", FAILURE_CATEGORIES.LOGIC],
  [/(?:unexpected variable|name the|named)/i, "WRONG_VARIABLE", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:type|double|float|string|int\b)/i, "WRONG_TYPE", FAILURE_CATEGORIES.STRUCTURE],
  [/(?:declare exactly|declaration|non-empty|source code is required)/i, "INCOMPLETE_SOLUTION", FAILURE_CATEGORIES.INCOMPLETE],
];

const PAYLOAD_FAILURE_CODES = Object.freeze({
  missing_counter: "MISSING_COUNTER",
  missing_outer_loop: "WRONG_LOOP_BOUNDS",
  missing_inner_loop: "WRONG_LOOP_BOUNDS",
  counting_corrupted: "WRONG_CONDITION",
  wrong_access: "WRONG_ARRAY_INDEX",
  missing_increment: "MISSING_INCREMENT",
  missing_return: "WRONG_RETURN_VALUE",
  wrong_dimensions: "WRONG_ARRAY_DIMENSIONS",
});

const classifyValidationFailure = ({
  sourceCode,
  validation,
  validatorConfig,
  compilerResult = null,
}) => {
  if (validation?.isCorrect) return null;
  const compilerFailure = classifyCompilerDiagnostic(compilerResult) ?? classifySyntax(sourceCode);
  if (compilerFailure) return compilerFailure;

  const values = validation?.payload?.values ?? {};
  const recursionError = validation?.payload?.recursionError;
  if (recursionError === "missingBaseCase") {
    return result("WRONG_RECURSIVE_BASE_CASE", FAILURE_CATEGORIES.LOGIC);
  }
  if (recursionError) {
    return result("WRONG_RECURSIVE_STEP", FAILURE_CATEGORIES.LOGIC);
  }
  if (Number.isInteger(values.failurePhase)) {
    return result(`FINAL_PHASE_${values.failurePhase}`, FAILURE_CATEGORIES.INCOMPLETE, {
      phase: values.failurePhase,
    });
  }
  if (PAYLOAD_FAILURE_CODES[values.failureType]) {
    return result(PAYLOAD_FAILURE_CODES[values.failureType], FAILURE_CATEGORIES.LOGIC);
  }

  const message = String(validation?.message ?? "");
  for (const [pattern, failureCode, category] of MESSAGE_RULES) {
    if (pattern.test(message)) return result(failureCode, category);
  }
  const fallback = TYPE_FALLBACKS[validatorConfig?.type];
  if (fallback) return result(fallback[0], fallback[1]);
  return result("UNKNOWN", FAILURE_CATEGORIES.UNKNOWN);
};

module.exports = {
  FAILURE_CATEGORIES,
  classifyCompilerDiagnostic,
  classifySyntax,
  classifyValidationFailure,
};
