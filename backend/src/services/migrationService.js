const fs = require("fs");
const path = require("path");
const sequelize = require("../config/database");
const {
  ensureUserRoleColumn,
  ensureUserStatusColumn,
  ensureUserActivityColumns,
} = require("./userRoleSchemaService");
const { ensureClassroomColumns } = require("./classroomSchemaService");
const { ensureProgressGradingColumns } = require("./progressSchemaService");
const { ensureLevelContentOverridesTable } = require("./levelContentSchemaService");
const { ensureGoogleAuthColumns } = require("./googleAuthSchemaService");
const { ensureEmailVerificationColumns } = require("./emailVerificationSchemaService");
const { ensureClassroomLessonsTable } = require("./classroomLessonSchemaService");

const sqlMigrationsDirectory = path.resolve(__dirname, "../../../supabase/migrations");

const runLegacySchemaUpgrade = async () => {
  await ensureUserRoleColumn();
  await ensureUserStatusColumn();
  await ensureUserActivityColumns();
  await ensureClassroomColumns();
  await ensureProgressGradingColumns();
  await ensureLevelContentOverridesTable();
  await ensureGoogleAuthColumns();
  await ensureEmailVerificationColumns();
  await ensureClassroomLessonsTable();
};

const sqlMigration = (filename) => async () => {
  const sql = await fs.promises.readFile(path.join(sqlMigrationsDirectory, filename), "utf8");
  await sequelize.query(sql);
};

const migrations = [
  ["000_schema_baseline", () => sequelize.sync()],
  ["001_legacy_schema_upgrade", runLegacySchemaUpgrade],
  ["20260812000000_enable_rls_for_backend_tables", sqlMigration("20260812000000_enable_rls_for_backend_tables.sql")],
  ["20260819000000_protect_all_backend_tables", sqlMigration("20260819000000_protect_all_backend_tables.sql")],
  ["20260822000000_panel_system_recommendations", sqlMigration("20260822000000_panel_system_recommendations.sql")],
];

const runMigrations = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "SharpRunnerMigrations" (
      "name" VARCHAR(255) PRIMARY KEY,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const [rows] = await sequelize.query('SELECT "name" FROM "SharpRunnerMigrations"');
  const applied = new Set(rows.map((row) => row.name));

  for (const [name, migrate] of migrations) {
    if (applied.has(name)) continue;
    await migrate();
    await sequelize.query(
      'INSERT INTO "SharpRunnerMigrations" ("name") VALUES (:name) ON CONFLICT ("name") DO NOTHING',
      { replacements: { name } },
    );
  }
};

module.exports = { migrations, runMigrations };
