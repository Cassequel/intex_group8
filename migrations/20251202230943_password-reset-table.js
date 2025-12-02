exports.up = async function (knex) {
  
    // 2. Rename wrong column name → event_location
    await knex.schema.alterTable('event_occurences', function (table) {
      table.renameColumn('even_location', 'event_location');
    });
  
    // -----------------------------------------
    // 4. Create password_reset_tokens table
    // -----------------------------------------
    await knex.schema.createTable('password_reset_tokens', function (table) {
      table.increments('id').primary();
      table
        .integer('user_id')
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('CASCADE');
  
      table.text('token_hash').notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.timestamp('used_at').nullable();
    });
  
    // 5. Index for performance
    await knex.schema.raw(`
      CREATE INDEX idx_password_reset_tokens_user_exp
      ON password_reset_tokens (user_id, expires_at)
    `);
  };
  
  
  
  // -----------------------------------------
  // DOWN (rollback)
  // -----------------------------------------
  
  exports.down = async function (knex) {
  
    await knex.schema.dropTableIfExists('password_reset_tokens');
  

  
    // Rename column back
    await knex.schema.alterTable('event_occurences', function (table) {
      table.renameColumn('event_location', 'even_location');
    });
  
  };