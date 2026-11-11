const pageSource = "collector-universe-backend";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== pageSource) return;
  if (event.data.type !== "sync-all") return;
  chrome.runtime.sendMessage({
    type: "sync:all-start",
    endpoint: event.data.endpoint || window.location.origin,
    token: event.data.token || "",
  }).then((result) => {
    window.postMessage({ source: pageSource, type: "sync-all-started", started: Boolean(result?.started) }, "*");
  }).catch((error) => {
    window.postMessage({ source: pageSource, type: "sync-all-error", message: error?.message || "扩展未连接" }, "*");
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "sync:all-status") return;
  window.postMessage({ source: pageSource, type: "sync-all-status", message: message.message }, "*");
});
