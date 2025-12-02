// migrations/TIMESTAMP_create_users_table.js
const bcrypt = require('bcrypt');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Create users table
  await knex.schema.createTable('users', function(table) {
    table.increments('id').primary();
    table.string('username').notNullable().unique();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.string('level').notNullable().defaultTo('U');
    table.timestamps(true, true);
  });

  // Hash passwords
  const adminPasswordHash = await bcrypt.hash('password', 10);
  const jakePasswordHash = await bcrypt.hash('jake', 10);
  const aidenPasswordHash = await bcrypt.hash('p', 10);

  // Insert initial admin and manager users
  await knex('users').insert([
    {
      username: 'admin',
      email: 'admin@company.com',
      password_hash: adminPasswordHash,
      level: 'M',
    },
    {
      username: 'jake',
      email: 'jakewright989@gmail.com',
      password_hash: jakePasswordHash,
      level: 'M',
    },
    {
        username: 'a',
        email: 'aiden@company.ent',
        password_hash: aidenPasswordHash,
        level: 'M',
      },
  ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('users');
};