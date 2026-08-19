const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");

const frontendLevelsDirectory = path.resolve(
  __dirname,
  "../../../frontend/src/pages/game/levels",
);
const levelConfigPath = path.join(frontendLevelsDirectory, "levelConfigs.js");
const validatorsPath = path.join(frontendLevelsDirectory, "validators.js");
const MAX_SOURCE_LENGTH = 100_000;

const findObjectEnd = (source, start) => {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) return index + 1;
  }
  throw new Error("Unterminated validator configuration");
};

const loadDefaultValidatorConfigs = () => {
  const source = fs.readFileSync(levelConfigPath, "utf8");
  const marker = /validatorConfig\s*:\s*{/g;
  const configs = [];
  let match;
  while ((match = marker.exec(source)) !== null) {
    const objectStart = source.indexOf("{", match.index);
    const objectEnd = findObjectEnd(source, objectStart);
    const literal = source.slice(objectStart, objectEnd);
    configs.push(vm.runInNewContext(`(${literal})`, Object.create(null), {
      timeout: 100,
    }));
    marker.lastIndex = objectEnd;
  }

  if (configs.length !== PLAYABLE_LEVEL_KEYS.length) {
    throw new Error(
      `Expected ${PLAYABLE_LEVEL_KEYS.length} validator configs, found ${configs.length}`,
    );
  }
  return new Map(PLAYABLE_LEVEL_KEYS.map((levelKey, index) => [levelKey, configs[index]]));
};

const defaultConfigs = loadDefaultValidatorConfigs();
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

const validateLevelCode = async ({ levelKey, sourceCode, validatorConfig }) => {
  if (typeof sourceCode !== "string" || !sourceCode.trim()) {
    return { isCorrect: false, message: "Source code is required to complete a level." };
  }
  if (sourceCode.length > MAX_SOURCE_LENGTH) {
    return { isCorrect: false, message: "Source code is too large." };
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
  return factory(config)(sourceCode);
};

module.exports = {
  MAX_SOURCE_LENGTH,
  getDefaultValidatorConfig: (levelKey) => defaultConfigs.get(levelKey) ?? null,
  validateLevelCode,
};
