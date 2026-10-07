// Netlify Function — GET /.netlify/functions/test-email?adminPasskey=...
//
// Sends one plain test email to ADMIN_EMAIL, and returns exactly what
// happened (success, or the real error message from Gmail/env vars).
// Use this to verify the email setup works before relying on it inside
// the captain-submission or deadline-summary flows.

const { sendEmail } = require("../../lib/emailClient");

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const isAdmin = params.adminPasskey === (process.env.ADMIN_PASSKEY || "sffcadmins");
  if (!isAdmin) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Incorrect admin passkey" }),
    };
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, reason: "GMAIL_USER and/or GMAIL_APP_PASSWORD is not set in Netlify environment variables." }),
    };
  }
  if (!process.env.ADMIN_EMAIL) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, reason: "ADMIN_EMAIL is not set in Netlify environment variables." }),
    };
  }

  try {
    const result = await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: "SFFC Test Email",
      html: `<p>This is a test email from the SFFC Fantasy League site, sent at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST"}.</p><p>If you're reading this, email sending is working correctly.</p>`,
    });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, sentTo: process.env.ADMIN_EMAIL, result }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, reason: err.message }),
    };
  }
};
