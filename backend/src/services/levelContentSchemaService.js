const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TABLE = "LevelContentOverrides";

const ensureLevelContentOverridesTable = async () => {
  const queryInterface = sequelize.getQueryInterface();

  let tableExists = true;
  try {
    await queryInterface.describeTable(TABLE);
  } catch {
    tableExists = false;
  }

  if (!tableExists) {
    await queryInterface.createTable(TABLE, {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      classroomId: { type: DataTypes.INTEGER, allowNull: false },
      levelKey: { type: DataTypes.STRING, allowNull: false },
      lessonCardTitle: { type: DataTypes.STRING, allowNull: true },
      lessonCardDescription: { type: DataTypes.TEXT, allowNull: true },
      goalTitle: { type: DataTypes.STRING, allowNull: true },
      goalDescription: { type: DataTypes.TEXT, allowNull: true },
      instructionItems: { type: DataTypes.JSONB, allowNull: true },
      defaultCode: { type: DataTypes.TEXT, allowNull: true },
      validatorConfig: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.addIndex(TABLE, ["classroomId", "levelKey"], {
      unique: true,
      name: "level_content_overrides_classroom_level_unique",
    });
  }
};

module.exports = { ensureLevelContentOverridesTable };
