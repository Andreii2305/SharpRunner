const { Sequelize } = require("sequelize");

const isEnabled = (value) => ["1", "true", "yes"].includes(
  String(value || "").trim().toLowerCase()
);

const options = {
  dialect: "postgres",
  logging: false,
  pool: {
    max: Number(process.env.DB_POOL_MAX) || 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};

if (isEnabled(process.env.DB_SSL)) {
  options.dialectOptions = {
    ssl: {
      require: true,
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    },
  };
}

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, options)
  : new Sequelize(
      process.env.DB_NAME || process.env.PGDATABASE,
      process.env.DB_USER || process.env.PGUSER,
      process.env.DB_PASSWORD || process.env.PGPASSWORD,
      {
        ...options,
        host: process.env.DB_HOST || process.env.PGHOST,
        port: process.env.DB_PORT || process.env.PGPORT || 5432,
      }
    );

module.exports = sequelize;
