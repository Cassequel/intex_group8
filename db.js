// db.js - shared Knex instance using knexfile config (matches migrations)
require('dotenv').config();
const knex = require('knex');
const knexConfig = require('./knexfile');

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

module.exports = db;
