export type LLMErrorKind =
  | 'not-configured'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'refusal'
  | 'bad-request'
  | 'truncated'
  | 'invalid-output'
  | 'unknown';

/** Provider-neutral error. Adapters translate their SDK errors into this. */
export class LLMError extends Error {
  constructor(
    public readonly kind: LLMErrorKind,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class PageAccessError extends Error {
  constructor(
    message: string,
    /** Origin the user can grant access to, if known. */
    public readonly needsPermission: boolean,
  ) {
    super(message);
    this.name = 'PageAccessError';
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
