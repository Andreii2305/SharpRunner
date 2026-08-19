const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const authMiddleware = require("../src/middleware/authMiddleware");
const models = require("../src/models");
const LevelContentOverride = require("../src/models/LevelContentOverride");
const { getClassroomLevelSettings } = require("../src/services/classroomLevelSettingsService");

const {
  hasDangerousSignature,
  isDangerousFilename,
} = require("../src/services/fileSecurityService");
const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const {
  getDefaultValidatorConfig,
  validateLevelCode,
} = require("../src/services/levelCodeValidationService");

test("dangerous upload extensions and executable signatures are rejected", async () => {
  assert.equal(isDangerousFilename("homework.pdf.exe"), true);
  assert.equal(isDangerousFilename("homework.pdf"), false);

  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sharprunner-security-"));
  const executable = path.join(directory, "renamed.pdf");
  const document = path.join(directory, "document.txt");
  try {
    await fs.promises.writeFile(executable, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
    await fs.promises.writeFile(document, "class Notes { }");
    assert.equal(await hasDangerousSignature(executable), true);
    assert.equal(await hasDangerousSignature(document), false);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test("the latest RLS migration covers every Sequelize model table", async () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../supabase/migrations/20260819000000_protect_all_backend_tables.sql",
  );
  const migration = await fs.promises.readFile(migrationPath, "utf8");
  const requiredTables = [
    ...new Set(
      Object.values(models)
        .filter((model) => typeof model?.getTableName === "function")
        .map((model) => model.getTableName()),
    ),
    "SharpRunnerMigrations",
  ];

  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`'${table}'`), `${table} must be protected`);
  }
});

test("every playable level has a server-side validator", async () => {
  for (const levelKey of PLAYABLE_LEVEL_KEYS) {
    assert.ok(getDefaultValidatorConfig(levelKey), `${levelKey} needs a validator config`);
    const result = await validateLevelCode({ levelKey, sourceCode: "invalid code" });
    assert.equal(result.isCorrect, false, `${levelKey} must reject invalid source`);
  }
});

test("authentication uses the current database role and rejects inactive users", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindByPk = User.findByPk;
  process.env.JWT_SECRET = "test-secret-that-is-not-used-in-production";
  const token = jwt.sign({ id: 42, role: "admin" }, process.env.JWT_SECRET);
  const request = { headers: { authorization: `Bearer ${token}` } };
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    User.findByPk = async () => ({ id: 42, role: "student", status: "active" });
    let calledNext = false;
    await authMiddleware(request, response, () => { calledNext = true; });
    assert.equal(calledNext, true);
    assert.equal(request.userRole, "student");

    User.findByPk = async () => ({ id: 42, role: "admin", status: "inactive" });
    response.statusCode = 200;
    response.body = null;
    await authMiddleware(request, response, () => assert.fail("inactive account reached next"));
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, "Account is not active");
  } finally {
    User.findByPk = originalFindByPk;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("classroom settings preserve trusted teacher validator overrides", async () => {
  const originalFindAll = LevelContentOverride.findAll;
  const validatorConfig = {
    type: "singleInteger",
    variableName: "customSteps",
    minValue: 2,
    maxValue: 2,
  };
  try {
    LevelContentOverride.findAll = async () => [{
      levelKey: "tutorial-level-1",
      validatorConfig,
    }];
    const settings = await getClassroomLevelSettings(99);
    assert.deepEqual(settings[0].validatorConfig, validatorConfig);
  } finally {
    LevelContentOverride.findAll = originalFindAll;
  }
});
