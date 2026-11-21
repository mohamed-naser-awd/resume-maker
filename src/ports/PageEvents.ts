import type { Unsubscribe } from './repositories';

/** Notifies when the active tab finished loading or the user switched tabs. */
export interface PageEvents {
  onActivePageReady(listener: (url: string) => void): Unsubscribe;
}
