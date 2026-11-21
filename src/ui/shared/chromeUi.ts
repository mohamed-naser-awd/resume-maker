/** Small UI-only helpers around chrome.* APIs (kept out of business logic). */

export const ALL_SITES = ['https://*/*', 'http://*/*'];

/** Must be called directly from a click handler (needs a user gesture). */
export function requestAllSitesAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: ALL_SITES });
}

export function hasAllSitesAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ALL_SITES });
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
