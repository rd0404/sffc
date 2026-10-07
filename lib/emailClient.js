// Sends email through Gmail SMTP (nodemailer).
// Needs GMAIL_USER and GMAIL_APP_PASSWORD in Netlify env vars.
const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
      },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email send.");
    return { skipped: true };
  }
  const recipients = Array.isArray(to) ? to : [to];
  // Send to everyone in one message, each as a hidden (bcc) recipient so
  // managers don't see each other's addresses.
  const info = await getTransporter().sendMail({
    from: `"SFFC Fantasy League" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    bcc: recipients,
    subject,
    html,
  });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

module.exports = { sendEmail };
