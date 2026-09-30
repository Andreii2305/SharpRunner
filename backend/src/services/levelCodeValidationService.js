const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const {
  classifyValidationFailure,
} = require("./failureClassificationService");
const { compilePracticeCode } = require("./practiceRunnerService");
const { parseValidatorConfigs } = require("./validatorConfigLoader");

const frontendLevelsDirectory = path.resolve(
  __dirname,
  "../../../frontend/src/pages/game/levels",
);
const validatorConfigsPath = path.join(frontendLevelsDirectory, "validatorConfigs.json");
const validatorsPath = path.join(frontendLevelsDirectory, "validators.js");
const MAX_SOURCE_LENGTH = 100_000;

const loadDefaultValidatorConfigs = () => {
  return parseValidatorConfigs(
    fs.readFileSync(validatorConfigsPath, "utf8"),
    {
      sourceName: validatorConfigsPath,
      playableLevelKeys: PLAYABLE_LEVEL_KEYS,
      factoryTypes: new Set(Object.keys(FACTORIES)),
    },
  );
};

let validatorsPromise;
const getValidators = () => {
  validatorsPromise ??= import(pathToFileURL(validatorsPath).href);
  return validatorsPromise;
};

const FACTORIES = {
  singleInteger: "createSingleIntegerDeclarationValidator",
  exactGoal: "createExactGoalDeclarationValidator",
  multiString: "createMultiStringDeclarationValidator",
  exactIntegerArray: "createExactIntegerArrayDeclarationValidator",
  exactStringArray: "createExactStringArrayDeclarationValidator",
  exactInteger2DArray: "createExactInteger2DArrayDeclarationValidator",
  stringArrayAccess: "createStringArrayAccessValidator",
  stringArrayTraversal: "createStringArrayTraversalValidator",
  predefinedVoidMethodCall: "createPredefinedVoidMethodCallValidator",
  predefinedVoidMethodArgument: "createPredefinedVoidMethodArgumentValidator",
  voidMethodDefinitionCall: "createVoidMethodDefinitionCallValidator",
  voidMethodBodyCall: "createVoidMethodBodyCallValidator",
  voidMethodParameterCall: "createVoidMethodParameterCallValidator",
  intReturnMethod: "createIntReturnMethodValidator",
  intParameterReturnMethod: "createIntParameterReturnMethodValidator",
  stringReturnMethod: "createStringReturnMethodValidator",
  integerArrayCount: "createIntegerArrayCountValidator",
  cursedCharmCountMethod: "createCursedCharmCountMethodValidator",
  recursiveStairMethod: "createRecursiveStairMethodValidator",
  voidMethodIntegerArrayParameter: "createVoidMethodIntegerArrayParameterValidator",
  voidMethodInteger2DArrayParameter: "createVoidMethodInteger2DArrayParameterValidator",
  blessedGraveCount2DMethod: "createBlessedGraveCount2DMethodValidator",
  bakunawaFinale: "createBakunawaFinaleValidator",
};

const defaultConfigs = loadDefaultValidatorConfigs();

const toFailureContract = ({ failureCode, category, metadata }) => ({
  code: failureCode,
  category,
  metadata: metadata ?? {},
});

const validateLevelCode = async ({
  levelKey,
  sourceCode,
  validatorConfig,
  compilerResult: suppliedCompilerResult,
}) => {
  if (typeof sourceCode !== "string" || !sourceCode.trim()) {
    const diagnosis = {
      failureCode: "INCOMPLETE_SOLUTION",
      category: "incomplete_solution",
      metadata: {},
    };
    return {
      isCorrect: false,
      failure: toFailureContract(diagnosis),
      ...diagnosis,
      message: "Source code is required to complete a level.",
    };
  }
  if (sourceCode.length > MAX_SOURCE_LENGTH) {
    const diagnosis = {
      failureCode: "INCOMPLETE_SOLUTION",
      category: "incomplete_solution",
      metadata: {},
    };
    return {
      isCorrect: false,
      failure: toFailureContract(diagnosis),
      ...diagnosis,
      message: "Source code is too large.",
    };
  }

  let compilerResult = suppliedCompilerResult;
  if (compilerResult === undefined) {
    try {
      compilerResult = await compilePracticeCode(sourceCode);
    } catch (error) {
      // The deterministic syntax fallback remains available while the isolated
      // compiler is starting or unavailable. Challenge correctness is never
      // decided by a client-provided compiler result.
      console.warn(`Challenge compiler unavailable (${error.reason || error.code || "unknown"}); using validator fallback.`);
      compilerResult = null;
    }
  }

  if (compilerResult?.success === false && compilerResult?.errorType !== "runner_busy") {
    const diagnosis = classifyValidationFailure({
      sourceCode,
      validation: { isCorrect: false },
      compilerResult,
    });
    if (diagnosis?.failureCode?.startsWith("COMPILER_")) {
      return {
        isCorrect: false,
        failure: toFailureContract(diagnosis),
        ...diagnosis,
        message: compilerResult.stderr || "The program must compile before its challenge logic can be checked.",
      };
    }
  }

  const config = validatorConfig ?? defaultConfigs.get(levelKey);
  const factoryName = FACTORIES[config?.type];
  if (!factoryName) {
    return { isCorrect: false, message: "The server validator is not configured for this level." };
  }
  const validators = await getValidators();
  const factory = validators[factoryName];
  if (typeof factory !== "function") {
    throw new Error(`Missing validator factory: ${factoryName}`);
  }
  const validation = factory(config)(sourceCode);
  if (validation?.isCorrect) return { ...validation, failure: null };
  const diagnosis = classifyValidationFailure({
    sourceCode,
    validation,
    validatorConfig: config,
    compilerResult,
  });
  return {
    ...validation,
    failure: toFailureContract(diagnosis),
    ...diagnosis,
  };
};

module.exports = {
  MAX_SOURCE_LENGTH,
  getDefaultValidatorConfig: (levelKey) => defaultConfigs.get(levelKey) ?? null,
  validateLevelCode,
};
