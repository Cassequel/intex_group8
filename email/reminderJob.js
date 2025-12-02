// reminderJob.js
const cron = require('node-cron');
const db = require('../db');
const { sendEventReminder } = require('./emailService');

// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Running event reminder job...');

  try {
    // ----- 1) 1 WEEK BEFORE -----
    const weekRows = await db('registration as r')
      .join('participants as p', 'p.participant_id', 'r.participant_id')
      .join('event_occurrences as o', 'o.eventoccurenceid', 'r.eventoccurenceid')
      .join('event_templates as t', 't.eventtemplateid', 'o.eventtemplateid')
      .whereRaw("DATE(o.eventdatetimestart) = CURRENT_DATE + INTERVAL '7 days'")
      .andWhere(function () {
        this.where('r.attended_flag', false).orWhereNull('r.attended_flag');
      })
      .andWhere(function () {
        this.where('r.reminder_week_sent', false).orWhereNull('r.reminder_week_sent');
      })
      .select(
        'r.registration_id',
        'p.email',
        'p.first_name',
        't.eventname as name',
        'o.eventdatetimestart as start_time',
        'o.eventlocation as location'
      );

    for (const row of weekRows) {
      const user = { email: row.email, firstName: row.first_name || 'Participant' };
      const event = {
        name: row.name,
        startTime: row.start_time,
        location: row.location || 'TBA',
      };

      await sendEventReminder(user, event);

      await db('registration')
        .where({ registration_id: row.registration_id })
        .update({ reminder_week_sent: true });

      console.log(`Sent 1-week reminder to ${user.email} for ${event.name}`);
    }

    // ----- 2) 1 DAY BEFORE -----
    const dayRows = await db('registration as r')
      .join('participants as p', 'p.participant_id', 'r.participant_id')
      .join('event_occurrences as o', 'o.eventoccurenceid', 'r.eventoccurenceid')
      .join('event_templates as t', 't.eventtemplateid', 'o.eventtemplateid')
      .whereRaw("DATE(o.eventdatetimestart) = CURRENT_DATE + INTERVAL '1 day'")
      .andWhere(function () {
        this.where('r.attended_flag', false).orWhereNull('r.attended_flag');
      })
      .andWhere(function () {
        this.where('r.reminder_day_sent', false).orWhereNull('r.reminder_day_sent');
      })
      .select(
        'r.registration_id',
        'p.email',
        'p.first_name',
        't.eventname as name',
        'o.eventdatetimestart as start_time',
        'o.eventlocation as location'
      );

    for (const row of dayRows) {
      const user = { email: row.email, firstName: row.first_name || 'Participant' };
      const event = {
        name: row.name,
        startTime: row.start_time,
        location: row.location || 'TBA',
      };

      await sendEventReminder(user, event);

      await db('registration')
        .where({ registration_id: row.registration_id })
        .update({ reminder_day_sent: true });

      console.log(`Sent 1-day reminder to ${user.email} for ${event.name}`);
    }

    console.log(
      `Reminder job done. Week reminders: ${weekRows.length}, Day reminders: ${dayRows.length}.`
    );
  } catch (err) {
    console.error('Error in event reminder job:', err);
  }
});
