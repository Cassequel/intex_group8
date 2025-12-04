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
  const resetLink = `http://ella-rises.com/reset-password?token=${token}`;

  return sendMail({
    to: user.email,
    subject: 'Reset Your Password - Ella Rises',
    html: `
      <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #3A3F3B; font-family: 'DM Serif Display', serif; margin-top: 0;">Reset Your Password</h2>

          <p style="color: #5a5a5a; line-height: 1.6;">Hi ${user.firstName},</p>

          <p style="color: #5a5a5a; line-height: 1.6;">We received a request to reset your password for your Ella Rises account. Click the button below to create a new password:</p>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="display: inline-block; background-color: #99B7C6; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 500; font-size: 16px;">Reset My Password</a>
          </p>

          <div style="background-color: #F7F9FA; border-left: 4px solid #99B7C6; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #3A3F3B; line-height: 1.6; font-size: 14px;">
              <strong>This link will expire in 1 hour.</strong> For your security, please reset your password as soon as possible.
            </p>
          </div>

          <div style="background-color: #FFF4E6; border-left: 4px solid #F7B092; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #3A3F3B; line-height: 1.6;">
              <strong>Didn't request this?</strong> If you didn't ask to reset your password, you can safely ignore this email. Your password will remain unchanged.
            </p>
          </div>

          <p style="color: #888888; font-size: 12px; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 15px;">
            This is an automated message from Ella Rises. If you're having trouble with the button above, copy and paste this link into your browser:<br>
            <a href="${resetLink}" style="color: #99B7C6; word-break: break-all;">${resetLink}</a>
          </p>
        </div>
      </div>
    `,
  });
}

async function sendNewDeviceAlert(user, deviceInfo) {
  const { browser, os, ip, location, timestamp } = deviceInfo;
  const formattedTime = timestamp ? new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short'
  }) : 'just now';

  return sendMail({
    to: user.email,
    subject: 'New Device Login Detected - Ella Rises',
    html: `
      <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #3A3F3B; font-family: 'DM Serif Display', serif; margin-top: 0;">New Device Login Detected</h2>

          <p style="color: #5a5a5a; line-height: 1.6;">Hi ${user.firstName},</p>

          <p style="color: #5a5a5a; line-height: 1.6;">We detected a login to your Ella Rises account from a new device. If this was you, no action is needed.</p>

          <div style="background-color: #F7F9FA; border-left: 4px solid #99B7C6; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 5px 0; color: #3A3F3B;"><strong>Time:</strong> ${formattedTime}</p>
            ${browser ? `<p style="margin: 5px 0; color: #3A3F3B;"><strong>Browser:</strong> ${browser}</p>` : ''}
            ${os ? `<p style="margin: 5px 0; color: #3A3F3B;"><strong>Operating System:</strong> ${os}</p>` : ''}
            ${ip ? `<p style="margin: 5px 0; color: #3A3F3B;"><strong>IP Address:</strong> ${ip}</p>` : ''}
            ${location ? `<p style="margin: 5px 0; color: #3A3F3B;"><strong>Location:</strong> ${location}</p>` : ''}
          </div>

          <div style="background-color: #FFF4E6; border-left: 4px solid #F7B092; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #3A3F3B; line-height: 1.6;">
              <strong>Didn't log in?</strong> If you don't recognize this activity, please reset your password immediately and contact our support team.
            </p>
          </div>

          <p style="color: #5a5a5a; line-height: 1.6; margin-top: 25px;">
            <a href="http://ella-rises.com/forgot-password" style="display: inline-block; background-color: #99B7C6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">Secure My Account</a>
          </p>

          <p style="color: #888888; font-size: 12px; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 15px;">
            This is an automated security notification from Ella Rises. For your security, we monitor account activity to help protect you from unauthorized access.
          </p>
        </div>
      </div>
    `,
  });
}

// --------------- event / calendar reminders ---------------
async function sendEventReminder(user, event) {
  const formattedDate = new Date(event.startTime).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return sendMail({
    to: user.email,
    subject: `Reminder: ${event.name} - Ella Rises`,
    html: `
      <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #3A3F3B; font-family: 'DM Serif Display', serif; margin-top: 0;">Event Reminder</h2>

          <p style="color: #5a5a5a; line-height: 1.6;">Hi ${user.firstName},</p>

          <p style="color: #5a5a5a; line-height: 1.6;">This is a friendly reminder about your upcoming event with Ella Rises!</p>

          <div style="background-color: #F7F9FA; border-left: 4px solid #99B7C6; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 5px 0 10px 0; color: #3A3F3B; font-size: 18px; font-weight: 600;">${event.name}</p>
            <p style="margin: 5px 0; color: #3A3F3B;"><strong>When:</strong> ${formattedDate}</p>
            <p style="margin: 5px 0; color: #3A3F3B;"><strong>Where:</strong> ${event.location}</p>
          </div>

          <div style="background-color: #FFF4E6; border-left: 4px solid #F7B092; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #3A3F3B; line-height: 1.6;">
              <strong>Can't make it?</strong> Please let us know as soon as possible so we can plan accordingly.
            </p>
          </div>

          <p style="color: #5a5a5a; line-height: 1.6; margin-top: 25px;">We look forward to seeing you there!</p>

          <p style="text-align: center; margin: 30px 0;">
            <a href="http://ella-rises.com/events" style="display: inline-block; background-color: #99B7C6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">View All Events</a>
          </p>

          <p style="color: #888888; font-size: 12px; margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 15px;">
            This is an automated reminder from Ella Rises. If you have any questions, please contact our team.
          </p>
        </div>
      </div>
    `,
  });
}

module.exports = {
  sendMail,
  sendPasswordReset,
  sendNewDeviceAlert,
  sendEventReminder,
};
