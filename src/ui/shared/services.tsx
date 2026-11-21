import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Container, Token } from '@/di/container';

const ContainerContext = createContext<Container | null>(null);

export function ServicesProvider({ container, children }: { container: Container; children: ReactNode }) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

/** Resolves a dependency from the DI container. Components never `new` services themselves. */
export function useService<T>(t: Token<T>): T {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('ServicesProvider is missing');
  return useMemo(() => container.resolve(t), [container, t]);
}
