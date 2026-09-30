const parseValidatorConfigs = (
  source,
  {
    sourceName = "validator configuration",
    playableLevelKeys = [],
    factoryTypes,
  } = {},
) => {
  let configs;
  try {
    configs = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Invalid validator configuration JSON in ${sourceName}: ${error.message}`,
      { cause: error },
    );
  }

  if (!configs || typeof configs !== "object" || Array.isArray(configs)) {
    throw new Error(`Validator configurations in ${sourceName} must be a JSON object`);
  }
  const missingLevelKeys = playableLevelKeys.filter(
    (levelKey) => !Object.hasOwn(configs, levelKey),
  );
  if (missingLevelKeys.length > 0) {
    throw new Error(
      `Missing validator configurations in ${sourceName}: ${missingLevelKeys.join(", ")}`,
    );
  }
  const playableLevelKeySet = new Set(playableLevelKeys);
  const unexpectedLevelKeys = Object.keys(configs).filter(
    (levelKey) => !playableLevelKeySet.has(levelKey),
  );
  if (unexpectedLevelKeys.length > 0) {
    throw new Error(
      `Unexpected validator configurations in ${sourceName}: ${unexpectedLevelKeys.join(", ")}`,
    );
  }

  for (const levelKey of playableLevelKeys) {
    const config = configs[levelKey];
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(
        `Invalid validator configuration for ${levelKey} in ${sourceName}: expected an object`,
      );
    }
    if (typeof config.type !== "string" || !config.type.trim()) {
      throw new Error(
        `Invalid validator type for ${levelKey} in ${sourceName}: expected a non-empty string`,
      );
    }
    if (factoryTypes && !factoryTypes.has(config.type)) {
      throw new Error(
        `Unknown validator type ${JSON.stringify(config.type)} for ${levelKey} in ${sourceName}`,
      );
    }
  }

  return new Map(playableLevelKeys.map((levelKey) => [levelKey, configs[levelKey]]));
};

module.exports = { parseValidatorConfigs };
