/**
 * Service worker. Kept deliberately thin: clicking the toolbar icon opens the side panel,
 * where all the work happens. (LLM calls run in the side panel page rather than here
 * because MV3 service workers can be suspended during long requests.)
 */
chrome.runtime.onInstalled.addListener((details) => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
