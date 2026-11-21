import {
  createAccomplishment,
  isDuplicate,
  type Accomplishment,
  type NewAccomplishment,
} from '@/domain/accomplishment';
import type { AccomplishmentRepository } from '@/ports/repositories';
import type { Clock, IdGenerator } from '@/ports/system';

export interface AccomplishmentServiceDeps {
  accomplishments: AccomplishmentRepository;
  idGen: IdGenerator;
  clock: Clock;
}

/** CRUD over the user's extra accomplishments (from chat or typed manually). */
export class AccomplishmentService {
  constructor(private readonly deps: AccomplishmentServiceDeps) {}

  list(): Promise<Accomplishment[]> {
    return this.deps.accomplishments.list();
  }

  /** Adds items, skipping blanks and duplicates. Returns only the ones actually added. */
  async addMany(items: NewAccomplishment[]): Promise<Accomplishment[]> {
    const current = await this.deps.accomplishments.list();
    const added: Accomplishment[] = [];
    for (const item of items) {
      if (!item.text.trim() || isDuplicate(item.text, [...current, ...added])) continue;
      added.push(createAccomplishment(item, this.deps.idGen, this.deps.clock));
    }
    if (added.length) await this.deps.accomplishments.saveAll([...current, ...added]);
    return added;
  }

  async add(item: NewAccomplishment): Promise<Accomplishment | null> {
    const [added] = await this.addMany([item]);
    return added ?? null;
  }

  async update(id: string, patch: Partial<NewAccomplishment>): Promise<Accomplishment[]> {
    const next = (await this.deps.accomplishments.list()).map((a) => (a.id === id ? { ...a, ...patch } : a));
    await this.deps.accomplishments.saveAll(next);
    return next;
  }

  async remove(id: string): Promise<Accomplishment[]> {
    const next = (await this.deps.accomplishments.list()).filter((a) => a.id !== id);
    await this.deps.accomplishments.saveAll(next);
    return next;
  }
}
