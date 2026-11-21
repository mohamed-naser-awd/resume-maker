/**
 * Minimal dependency-injection container.
 *
 * - Tokens are typed, so `resolve(TOKENS.llm)` returns an `LLMProvider`.
 * - Registrations are lazy singletons (factory runs on first resolve).
 * - `override()` lets tests or alternative builds swap any implementation.
 */

export interface Token<T> {
  readonly key: symbol;
  /** Phantom field that carries the type; never set at runtime. */
  readonly __type?: T;
}

export const token = <T>(description: string): Token<T> => ({ key: Symbol(description) });

type Factory<T> = (c: Container) => T;

export class Container {
  private factories = new Map<symbol, Factory<unknown>>();
  private instances = new Map<symbol, unknown>();

  register<T>(t: Token<T>, factory: Factory<T>): this {
    this.factories.set(t.key, factory);
    this.instances.delete(t.key);
    return this;
  }

  /** Replace a registration (e.g. a fake LLM in tests). Clears all cached instances. */
  override<T>(t: Token<T>, factory: Factory<T>): this {
    this.factories.set(t.key, factory);
    this.instances.clear();
    return this;
  }

  resolve<T>(t: Token<T>): T {
    if (this.instances.has(t.key)) return this.instances.get(t.key) as T;
    const factory = this.factories.get(t.key);
    if (!factory) throw new Error(`No registration for ${t.key.description}`);
    const instance = factory(this) as T;
    this.instances.set(t.key, instance);
    return instance;
  }
}
