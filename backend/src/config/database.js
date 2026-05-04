const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME || process.env.PGDATABASE,
  process.env.DB_USER || process.env.PGUSER,
  process.env.DB_PASSWORD || process.env.PGPASSWORD,
  {
    host: process.env.DB_HOST || process.env.PGHOST,
    port: process.env.DB_PORT || process.env.PGPORT || 5432,
    dialect: "postgres",
    logging: false,
  }
);

module.exports = sequelize;
