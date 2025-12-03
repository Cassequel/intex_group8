exports.up = function (knex) {
  return knex.schema.alterTable('registrations', function (table) {
    table.boolean('reminder_week_sent').defaultTo(false);
    table.boolean('reminder_day_sent').defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('registrations', function (table) {
    table.dropColumn('reminder_week_sent');
    table.dropColumn('reminder_day_sent');
  });
};
