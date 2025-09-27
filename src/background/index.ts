chrome.runtime.onInstalled.addListener(() => {
  console.info('Semantic Memory background worker installed.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.ping === 'semantic-memory') {
    sendResponse({ pong: true });
  }
});
