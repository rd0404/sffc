// Minimal wrapper around Resend's transactional email API.
// Needs RESEND_API_KEY and ADMIN_EMAIL set in Netlify. FROM_EMAIL is
// optional — defaults to Resend's shared sandbox sender.

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email send.");
    return { skipped: true };
  }

  const from = process.env.FROM_EMAIL || "SFFC Fantasy League <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API ${res.status}: ${text}`);
  }

  return res.json();
}

module.exports = { sendEmail };
