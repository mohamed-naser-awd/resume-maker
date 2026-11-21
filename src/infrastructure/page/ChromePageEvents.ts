import type { PageEvents } from '@/ports/PageEvents';
import type { Unsubscribe } from '@/ports/repositories';

/** chrome.tabs-backed PageEvents: fires when the active tab finishes loading or becomes active. */
export class ChromePageEvents implements PageEvents {
  onActivePageReady(listener: (url: string) => void): Unsubscribe {
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (info.status === 'complete' || (info.url && tab.status === 'complete'))) listener(tab.url ?? '');
    };
    const onActivated = async ({ tabId }: { tabId: number }) => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') listener(tab.url ?? '');
      } catch {
        /* tab closed */
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onActivated.addListener(onActivated);
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }
}
