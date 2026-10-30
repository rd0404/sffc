const { openStore } = require("./blobStore");

function summaryStore() {
  return openStore("sffc-deadline-summaries");
}

async function getLastSummarizedEvent() {
  // Errors are NOT swallowed: if storage can't be read we must stop, otherwise
  // we'd think nothing was ever summarized and email everyone again.
  const data = await summaryStore().get("lastSummarizedEvent", { type: "json" });
  return data ? data.event : 0;
}

async function setLastSummarizedEvent(event) {
  const store = summaryStore();
  await store.setJSON("lastSummarizedEvent", { event });
}

module.exports = { getLastSummarizedEvent, setLastSummarizedEvent };
