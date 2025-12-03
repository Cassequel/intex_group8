const sgMail = require('./transporter');

async function sendMail({ to, subject, html }) {
  // SendGrid API uses sgMail.send (array or single object)
  await sgMail.send({
    from: process.env.FROM_EMAIL || '"Ella Rises (No Reply)" <no-reply@ella-rises.com>',
    to,
    subject,
    html,
  });
}

// --------------- transactional ---------------
async function sendPasswordReset(user, token) {
  const resetLink = `https://ella-rises.com/reset-password?token=${token}`;


  return sendMail({
    to: user.email,
    subject: 'Reset your password',
    html: `
      <p>Hi ${user.firstName},</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>If you didn’t request this, you can ignore this email.</p>
    `,
  });
}

async function sendNewDeviceAlert(user, deviceInfo) {
  // Temporarily disabled new-device alert emails.
  return Promise.resolve();
}

// --------------- event / calendar reminders ---------------
async function sendEventReminder(user, event) {
  return sendMail({
    to: user.email,
    subject: `Reminder: ${event.name} on ${event.startTime.toLocaleString()}`,
    html: `
      <p>Hi ${user.firstName},</p>
      <p>This is a reminder for <b>${event.name}</b>.</p>
      <p><b>When:</b> ${event.startTime.toLocaleString()}</p>
      <p><b>Where:</b> ${event.location}</p>
      <p>See you there!</p>
    `,
  });
}

module.exports = {
  sendMail,
  sendPasswordReset,
  sendNewDeviceAlert,
  sendEventReminder,
};
