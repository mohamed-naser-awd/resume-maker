import { LLMError, PageAccessError, errorMessage } from '@/domain/errors';
import { requestAllSitesAccess } from './chromeUi';

interface Props {
  error: unknown;
  onDismiss?: () => void;
  /** Called after the user grants page access, e.g. to retry. */
  onPermissionGranted?: () => void;
}

export function ErrorBanner({ error, onDismiss, onPermissionGranted }: Props) {
  if (!error) return null;
  const needsSettings = error instanceof LLMError && (error.kind === 'not-configured' || error.kind === 'auth');
  const needsPermission = error instanceof PageAccessError && error.needsPermission;

  return (
    <div className="banner error" role="alert">
      <span>{errorMessage(error)}</span>
      <div className="banner-actions">
        {needsSettings && (
          <button className="btn small" onClick={() => chrome.runtime.openOptionsPage()}>
            Open Settings
          </button>
        )}
        {needsPermission && (
          <button
            className="btn small"
            onClick={async () => {
              if (await requestAllSitesAccess()) onPermissionGranted?.();
            }}
          >
            Grant page access
          </button>
        )}
        {onDismiss && (
          <button className="btn small ghost" onClick={onDismiss} aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
