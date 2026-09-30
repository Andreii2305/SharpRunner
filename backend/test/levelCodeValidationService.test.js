const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const loaderPath = path.resolve(
  __dirname,
  "../src/services/validatorConfigLoader.js",
);

test("validator service startup does not depend on node:vm execution", () => {
  const vm = require("node:vm");
  const originalRunInNewContext = vm.runInNewContext;
  const servicePath = require.resolve("../src/services/levelCodeValidationService");
  const cachedService = require.cache[servicePath];

  try {
    delete require.cache[servicePath];
    vm.runInNewContext = () => {
      throw new Error("validator config used node:vm");
    };
    assert.doesNotThrow(() => {
      require("../src/services/levelCodeValidationService");
    });
  } finally {
    vm.runInNewContext = originalRunInNewContext;
    if (cachedService) require.cache[servicePath] = cachedService;
  }
});

test("malformed validator configuration JSON fails with source context", () => {
  const { parseValidatorConfigs } = require(loaderPath);

  assert.throws(
    () => parseValidatorConfigs("{ invalid", {
      sourceName: "broken-validator-configs.json",
      playableLevelKeys: ["tutorial-level-1"],
      factoryTypes: new Set(["singleInteger"]),
    }),
    /Invalid validator configuration JSON in broken-validator-configs\.json:/,
  );
});

test("missing playable validator configurations fail clearly", () => {
  const { parseValidatorConfigs } = require(loaderPath);

  assert.throws(
    () => parseValidatorConfigs(JSON.stringify({
      "tutorial-level-1": { type: "singleInteger" },
    }), {
      sourceName: "validator-configs.json",
      playableLevelKeys: ["tutorial-level-1", "tutorial-level-2"],
      factoryTypes: new Set(["singleInteger", "exactGoal"]),
    }),
    /Missing validator configurations in validator-configs\.json: tutorial-level-2/,
  );
});

test("non-object playable validator configurations fail clearly", () => {
  const { parseValidatorConfigs } = require(loaderPath);

  assert.throws(
    () => parseValidatorConfigs(JSON.stringify({
      "tutorial-level-1": null,
    }), {
      sourceName: "validator-configs.json",
      playableLevelKeys: ["tutorial-level-1"],
      factoryTypes: new Set(["singleInteger"]),
    }),
    /Invalid validator configuration for tutorial-level-1 in validator-configs\.json: expected an object/,
  );
});

test("unknown validator factory types fail during configuration loading", () => {
  const { parseValidatorConfigs } = require(loaderPath);

  assert.throws(
    () => parseValidatorConfigs(JSON.stringify({
      "tutorial-level-1": { type: "unknownValidator" },
    }), {
      sourceName: "validator-configs.json",
      playableLevelKeys: ["tutorial-level-1"],
      factoryTypes: new Set(["singleInteger"]),
    }),
    /Unknown validator type "unknownValidator" for tutorial-level-1 in validator-configs\.json/,
  );
});

test("missing validator types fail with a specific shape error", () => {
  const { parseValidatorConfigs } = require(loaderPath);

  assert.throws(
    () => parseValidatorConfigs(JSON.stringify({
      "tutorial-level-1": {},
    }), {
      sourceName: "validator-configs.json",
      playableLevelKeys: ["tutorial-level-1"],
      factoryTypes: new Set(["singleInteger"]),
    }),
    /Invalid validator type for tutorial-level-1 in validator-configs\.json: expected a non-empty string/,
  );
});

test("unexpected validator configuration mappings fail clearly", () => {
  const { parseValidatorConfigs } = require(loaderPath);

  assert.throws(
    () => parseValidatorConfigs(JSON.stringify({
      "tutorial-level-1": { type: "singleInteger" },
      "retired-level-1": { type: "singleInteger" },
    }), {
      sourceName: "validator-configs.json",
      playableLevelKeys: ["tutorial-level-1"],
      factoryTypes: new Set(["singleInteger"]),
    }),
    /Unexpected validator configurations in validator-configs\.json: retired-level-1/,
  );
});

test("every playable level loads exactly one default validator configuration", () => {
  const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
  const { getDefaultValidatorConfig } = require(
    "../src/services/levelCodeValidationService"
  );
  const sharedConfigs = JSON.parse(fs.readFileSync(
    path.resolve(
      __dirname,
      "../../frontend/src/pages/game/levels/validatorConfigs.json",
    ),
    "utf8",
  ));

  assert.equal(Object.keys(sharedConfigs).length, PLAYABLE_LEVEL_KEYS.length);
  for (const levelKey of PLAYABLE_LEVEL_KEYS) {
    assert.deepEqual(getDefaultValidatorConfig(levelKey), sharedConfigs[levelKey]);
  }
});

test("representative default validator values remain unchanged", () => {
  const { getDefaultValidatorConfig } = require(
    "../src/services/levelCodeValidationService"
  );

  assert.deepEqual(getDefaultValidatorConfig("tutorial-level-1"), {
    type: "singleInteger",
    variableName: "steps",
    minValue: 1,
    maxValue: 40,
    unexpectedVariableMessage: 'Unexpected variable. Only "steps" is allowed in Level 1.',
    successMessage: "Code accepted. Executing walk steps...",
  });
  assert.deepEqual(getDefaultValidatorConfig("arrays-level-5").expectedRows, [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ]);
  assert.deepEqual(getDefaultValidatorConfig("functions-level-9").parameters, [
    { type: "int", name: "basePower" },
    { type: "int", name: "bonus" },
  ]);
  assert.deepEqual(getDefaultValidatorConfig("final-level-1"), {
    type: "bakunawaFinale",
  });
});

test("frontend validator factories use the shared configurations without duplicate literals", () => {
  const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
  const levelConfigsSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../frontend/src/pages/game/levels/levelConfigs.js",
    ),
    "utf8",
  );
  const sharedFactoryKeys = [
    ...levelConfigsSource.matchAll(
      /validateCode:\s*\w+\(getValidatorFactoryConfig\("([^"]+)"\)\)/g,
    ),
  ].map((match) => match[1]);
  const inlineFactoryConfigs = [
    ...levelConfigsSource.matchAll(/validateCode:\s*\w+\(\s*{/g),
  ];

  assert.deepEqual(sharedFactoryKeys, PLAYABLE_LEVEL_KEYS.slice(0, -1));
  assert.equal(inlineFactoryConfigs.length, 1);
  assert.match(
    levelConfigsSource,
    /validateCode:\s*createBakunawaFinaleValidator\(\{\s*successMessage: "The last compile succeeded\. Breaking the eclipse\.\.\.",\s*}\)/,
  );
});
