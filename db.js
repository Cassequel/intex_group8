// db.js
require('dotenv').config();
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.RDS_HOST_NAME || 'localhost',
    user: process.env.RDS_USER_NAME || 'postgres',
    password: process.env.RDS_PASSWORD || 'admin',
    database: process.env.RDS_DB_NAME || 'ellarises-test',
    port: process.env.RDS_PORT || 5432,
  },
});

module.exports = db;
