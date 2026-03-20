const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const CLASSROOM_TABLE_NAME = "Classrooms";
const CLASSROOM_SCHOOL_YEAR_COLUMN_NAME = "schoolYear";
const CLASSROOM_MAX_STUDENTS_COLUMN_NAME = "maxStudents";
const CLASSROOM_DESCRIPTION_COLUMN_NAME = "description";

const ensureClassroomColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableDefinition = await queryInterface.describeTable(CLASSROOM_TABLE_NAME);

  if (!tableDefinition[CLASSROOM_SCHOOL_YEAR_COLUMN_NAME]) {
    await queryInterface.addColumn(CLASSROOM_TABLE_NAME, CLASSROOM_SCHOOL_YEAR_COLUMN_NAME, {
      type: DataTypes.STRING,
      allowNull: true,
    });

    await sequelize.query(
      `UPDATE "Classrooms"
       SET "schoolYear" = '2025-2026'
       WHERE "schoolYear" IS NULL OR TRIM("schoolYear") = '';`,
    );

    await queryInterface.changeColumn(CLASSROOM_TABLE_NAME, CLASSROOM_SCHOOL_YEAR_COLUMN_NAME, {
      type: DataTypes.STRING,
      allowNull: false,
    });
  }

  if (!tableDefinition[CLASSROOM_MAX_STUDENTS_COLUMN_NAME]) {
    await queryInterface.addColumn(CLASSROOM_TABLE_NAME, CLASSROOM_MAX_STUDENTS_COLUMN_NAME, {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
  }

  if (!tableDefinition[CLASSROOM_DESCRIPTION_COLUMN_NAME]) {
    await queryInterface.addColumn(CLASSROOM_TABLE_NAME, CLASSROOM_DESCRIPTION_COLUMN_NAME, {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
};

module.exports = {
  ensureClassroomColumns,
};
