const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const USER_TABLE_NAME = "Users";
const USER_ROLE_COLUMN_NAME = "role";
const USER_STATUS_COLUMN_NAME = "status";
const USER_IS_PLAYING_GAME_COLUMN_NAME = "isPlayingGame";
const USER_LAST_GAME_HEARTBEAT_AT_COLUMN_NAME = "lastGameHeartbeatAt";
const USER_LAST_LOGIN_AT_COLUMN_NAME = "lastLoginAt";
const USER_TOKEN_VERSION_COLUMN_NAME = "tokenVersion";
const ALLOWED_ROLES = ["student", "teacher", "admin"];
const ALLOWED_STATUSES = ["active", "inactive", "pending", "archived"];

const ensureUserRoleColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableDefinition = await queryInterface.describeTable(USER_TABLE_NAME);

  if (!tableDefinition[USER_ROLE_COLUMN_NAME]) {
    await queryInterface.addColumn(USER_TABLE_NAME, USER_ROLE_COLUMN_NAME, {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "student",
    });
  }

  await sequelize.query(
    `UPDATE "Users"
     SET "role" = LOWER(TRIM(COALESCE("role", '')))
     WHERE "role" IS NULL OR "role" <> LOWER(TRIM(COALESCE("role", '')));`
  );

  await sequelize.query(
    `UPDATE "Users"
     SET "role" = 'student'
     WHERE "role" = '' OR "role" NOT IN (:allowedRoles);`,
    {
      replacements: { allowedRoles: ALLOWED_ROLES },
    }
  );
};

const ensureUserStatusColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableDefinition = await queryInterface.describeTable(USER_TABLE_NAME);

  if (!tableDefinition[USER_STATUS_COLUMN_NAME]) {
    await queryInterface.addColumn(USER_TABLE_NAME, USER_STATUS_COLUMN_NAME, {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    });
  }

  await sequelize.query(
    `UPDATE "Users"
     SET "status" = LOWER(TRIM(COALESCE("status", '')))
     WHERE "status" IS NULL OR "status" <> LOWER(TRIM(COALESCE("status", '')));`
  );

  await sequelize.query(
    `UPDATE "Users"
     SET "status" = 'active'
     WHERE "status" = '' OR "status" NOT IN (:allowedStatuses);`,
    {
      replacements: { allowedStatuses: ALLOWED_STATUSES },
    }
  );
};

const ensureUserActivityColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableDefinition = await queryInterface.describeTable(USER_TABLE_NAME);

  if (!tableDefinition[USER_IS_PLAYING_GAME_COLUMN_NAME]) {
    await queryInterface.addColumn(
      USER_TABLE_NAME,
      USER_IS_PLAYING_GAME_COLUMN_NAME,
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    );
  }

  if (!tableDefinition[USER_LAST_GAME_HEARTBEAT_AT_COLUMN_NAME]) {
    await queryInterface.addColumn(
      USER_TABLE_NAME,
      USER_LAST_GAME_HEARTBEAT_AT_COLUMN_NAME,
      {
        type: DataTypes.DATE,
        allowNull: true,
      },
    );
  }

  if (!tableDefinition[USER_LAST_LOGIN_AT_COLUMN_NAME]) {
    await queryInterface.addColumn(USER_TABLE_NAME, USER_LAST_LOGIN_AT_COLUMN_NAME, {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }

  await sequelize.query(
    `UPDATE "Users"
     SET "isPlayingGame" = false
     WHERE "isPlayingGame" IS NULL;`,
  );
};

const ensureUserTokenVersionColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableDefinition = await queryInterface.describeTable(USER_TABLE_NAME);
  if (!tableDefinition[USER_TOKEN_VERSION_COLUMN_NAME]) {
    await queryInterface.addColumn(USER_TABLE_NAME, USER_TOKEN_VERSION_COLUMN_NAME, {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }
  await sequelize.query('UPDATE "Users" SET "tokenVersion" = 0 WHERE "tokenVersion" IS NULL');
};

module.exports = {
  ensureUserRoleColumn,
  ensureUserStatusColumn,
  ensureUserActivityColumns,
  ensureUserTokenVersionColumn,
};
