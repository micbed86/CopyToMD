/**
 * Background script for "Copy with Formatting (as Markdown)" Chrome Extension.
 */

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'open_settings' }).catch((err) => {
    console.warn('Could not send message to tab. Content script might not be loaded yet.', err);
  });
});
