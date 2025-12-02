/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {

    // -----------------------------
    // PRIMARY KEY RENAMES - renames all id PKs to tablename_id
    // -----------------------------
  
    await knex.schema.alterTable('participants', table => {
      table.renameColumn('id', 'participant_id');
    });
  
    await knex.schema.alterTable('event_templates', table => {
      table.renameColumn('id', 'event_template_id');
    });
  
    await knex.schema.alterTable('event_occurences', table => {
      table.renameColumn('id', 'event_occurence_id');
    });
  
    await knex.schema.alterTable('registrations', table => {
      table.renameColumn('id', 'registration_id');
    });
  
    await knex.schema.alterTable('surveys', table => {
      table.renameColumn('id', 'survey_id');
    });
  
    await knex.schema.alterTable('milestones', table => {
      table.renameColumn('id', 'milestone_id');
    });
  
    await knex.schema.alterTable('donations', table => {
      table.renameColumn('id', 'donation_id');
    });
    
    await knex.schema.alterTable('users', table => {
      table.renameColumn('id', 'user_id');
    });
  
  
    // ---------------------------------------------------
    // FOREIGN KEY RENAMES (first drop existing FKs)
    // ---------------------------------------------------
  
    // event_occurences.event_template_id
    await knex.schema.alterTable('event_occurences', table => {
      table.dropForeign('event_template_id');
    });
  
    // registrations.participant_id + registrations.event_occurence_id
    await knex.schema.alterTable('registrations', table => {
      table.dropForeign('participant_id');
      table.dropForeign('event_occurence_id');
    });
  
    // surveys.participant_id + surveys.event_occurence_id
    await knex.schema.alterTable('surveys', table => {
      table.dropForeign('participant_id');
      table.dropForeign('event_occurence_id');
    });
  
    // milestones.participant_id
    await knex.schema.alterTable('milestones', table => {
      table.dropForeign('participant_id');
    });
  
  
    // ---------------------------------------------------
    // RE-ADD FOREIGN KEYS pointing to new PK names
    // ---------------------------------------------------
  
    // event_occurences.event_template_id -> event_templates.event_template_id
    await knex.schema.alterTable('event_occurences', table => {
      table
        .foreign('event_template_id')
        .references('event_template_id')
        .inTable('event_templates')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    });
  
    // registrations
    await knex.schema.alterTable('registrations', table => {
      table
        .foreign('participant_id')
        .references('participant_id')
        .inTable('participants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
  
      table
        .foreign('event_occurence_id')
        .references('event_occurence_id')
        .inTable('event_occurences')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    });
  
    // surveys
    await knex.schema.alterTable('surveys', table => {
      table
        .foreign('participant_id')
        .references('participant_id')
        .inTable('participants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
  
      table
        .foreign('event_occurence_id')
        .references('event_occurence_id')
        .inTable('event_occurences')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    });
  
    // milestones.participant_id -> participants.participant_id
    await knex.schema.alterTable('milestones', table => {
      table
        .foreign('participant_id')
        .references('participant_id')
        .inTable('participants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    });
  
  };
  
  
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = async function(knex) {
  
    // Drop FKs in reverse order
    await knex.schema.alterTable('milestones', table => {
      table.dropForeign('participant_id');
    });
  
    await knex.schema.alterTable('surveys', table => {
      table.dropForeign('participant_id');
      table.dropForeign('event_occurence_id');
    });
  
    await knex.schema.alterTable('registrations', table => {
      table.dropForeign('participant_id');
      table.dropForeign('event_occurence_id');
    });
  
    await knex.schema.alterTable('event_occurences', table => {
      table.dropForeign('event_template_id');
    });
  
    // Rename PKs back
    await knex.schema.alterTable('donations', table => {
      table.renameColumn('donation_id', 'id');
    });
  
    await knex.schema.alterTable('milestones', table => {
      table.renameColumn('milestone_id', 'id');
    });
  
    await knex.schema.alterTable('surveys', table => {
      table.renameColumn('survey_id', 'id');
    });
  
    await knex.schema.alterTable('registrations', table => {
      table.renameColumn('registration_id', 'id');
    });
  
    await knex.schema.alterTable('event_occurences', table => {
      table.renameColumn('event_occurence_id', 'id');
    });
  
    await knex.schema.alterTable('event_templates', table => {
      table.renameColumn('event_template_id', 'id');
    });
  
    await knex.schema.alterTable('participants', table => {
      table.renameColumn('participant_id', 'id');
    });
  
    await knex.schema.alterTable('users', table => {
      table.renameColumn('user', 'id');
    });
  };