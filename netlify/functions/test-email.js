// Netlify Function — GET /.netlify/functions/test-email?adminPasskey=...
//
// Sends one plain test email to ADMIN_EMAIL, and returns exactly what
// happened (success, or the real error message from Gmail/env vars).
// Use this to verify the email setup works before relying on it inside
// the captain-submission or deadline-summary flows.

const { sendEmail } = require("../../lib/emailClient");
const teamEmails = require("../../lib/teamEmails");

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

  // Optional: &to=someone@example.com — only allowed for addresses that are
  // already in the manager email list (or the admin address).
  let target = process.env.ADMIN_EMAIL;
  if (params.to) {
    const want = String(params.to).trim().toLowerCase();
    const allowed = new Set([...Object.values(teamEmails), process.env.ADMIN_EMAIL].filter(Boolean).map((e) => e.toLowerCase()));
    if (!allowed.has(want)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, reason: "That address isn't in the manager email list." }),
      };
    }
    target = want;
  }

  try {
    const result = await sendEmail({
      to: target,
      subject: "SFFC Test Email",
      html: `<p>This is a test email from the SFFC Fantasy League site, sent at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST"}.</p><p>If you're reading this, email sending is working correctly.</p>`,
    });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, sentTo: target, result }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, reason: err.message }),
    };
  }
};
