const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const USER_TABLE_NAME = "Users";
const USER_ROLE_COLUMN_NAME = "role";
const ALLOWED_ROLES = ["student", "teacher", "admin"];

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

module.exports = {
  ensureUserRoleColumn,
};
