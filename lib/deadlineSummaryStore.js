const { getStore } = require("@netlify/blobs");

function summaryStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: "sffc-deadline-summaries", siteID, token });
  }
  return getStore("sffc-deadline-summaries");
}

async function getLastSummarizedEvent() {
  const store = summaryStore();
  try {
    const data = await store.get("lastSummarizedEvent", { type: "json" });
    return data ? data.event : 0;
  } catch (_) {
    return 0;
  }
}

async function setLastSummarizedEvent(event) {
  const store = summaryStore();
  await store.setJSON("lastSummarizedEvent", { event });
}

module.exports = { getLastSummarizedEvent, setLastSummarizedEvent };
