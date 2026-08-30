import { PLEJECENTRE } from './data/plejecentre';
import { compare, fold, ownershipGroup } from './format';
import type { Filters, OwnershipGroup, Plejecenter } from './types';

const ALL_OWNERSHIP: OwnershipGroup[] = ['Kommunal', 'Selvejende', 'Privat'];

/** Search index built once — 148 rows, so a linear scan is plenty. */
const INDEX = new Map<string, string>(
  PLEJECENTRE.map((p) => [
    p.id,
    fold([p.name, p.street, p.postcode, p.city, p.municipality].join(' ')),
  ]),
);

const MUNICIPALITY_NAMES = [...new Set(PLEJECENTRE.map((p) => p.municipality))];

/**
 * Order depends on the reader's language: Danish sorts Æ, Ø and Å after Z,
 * which is not what an English or Persian reader expects of the same list. Both
 * are recomputed when the locale changes.
 */
export let MUNICIPALITIES: string[] = [];
export let ALL: Plejecenter[] = [];

export function resortForLocale(): void {
  MUNICIPALITIES = [...MUNICIPALITY_NAMES].sort(compare);
  ALL = [...PLEJECENTRE].sort(
    (a, b) => compare(a.municipality, b.municipality) || compare(a.name, b.name),
  );
}
resortForLocale();

type Listener = () => void;

export class Store {
  filters: Filters = {
    query: '',
    municipality: null,
    ownership: new Set(ALL_OWNERSHIP),
    visitedOnly: false,
  };

  /**
   * Which ids the reader has marked. Held as a predicate rather than a copy so
   * the store never has to be told again when the account changes.
   */
  isVisited: (id: string) => boolean = () => false;

  selectedId: string | null = null;
  visible: Plejecenter[] = ALL;

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }

  private emit(): void {
    this.visible = this.compute();
    // A selection that just got filtered out must not linger in the panel.
    if (this.selectedId && !this.visible.some((p) => p.id === this.selectedId)) {
      this.selectedId = null;
    }
    for (const fn of this.listeners) fn();
  }

  private compute(): Plejecenter[] {
    const { query, municipality, ownership, visitedOnly } = this.filters;
    const terms = fold(query).split(/\s+/).filter(Boolean);
    return ALL.filter((p) => {
      if (visitedOnly && !this.isVisited(p.id)) return false;
      if (municipality && p.municipality !== municipality) return false;
      if (!ownership.has(ownershipGroup(p))) return false;
      if (terms.length === 0) return true;
      const hay = INDEX.get(p.id) ?? '';
      return terms.every((t) => hay.includes(t));
    });
  }

  get selected(): Plejecenter | null {
    return this.selectedId ? (ALL.find((p) => p.id === this.selectedId) ?? null) : null;
  }

  setQuery(q: string): void {
    this.filters.query = q;
    this.emit();
  }

  /**
   * Recompute what is visible, without changing a filter.
   *
   * The visited-only filter reads a predicate that lives outside the store, so
   * when that predicate's answer changes -- somebody unmarks a place -- the
   * filters are the same but their result is not. Without this the list and
   * the count kept showing a place that had just been removed.
   */
  refresh(): void {
    this.emit();
  }

  setVisitedOnly(on: boolean): void {
    this.filters.visitedOnly = on;
    this.emit();
  }

  byId(id: string): Plejecenter | undefined {
    return ALL.find((p) => p.id === id);
  }

  setMunicipality(m: string | null): void {
    this.filters.municipality = m;
    this.emit();
  }

  toggleOwnership(o: OwnershipGroup): void {
    const set = this.filters.ownership;
    if (set.has(o)) set.delete(o);
    else set.add(o);
    // Turning the last one off would show an empty map with no way to read why.
    if (set.size === 0) for (const k of ALL_OWNERSHIP) set.add(k);
    this.emit();
  }

  select(id: string | null): void {
    this.selectedId = id;
    for (const fn of this.listeners) fn();
  }

  reset(): void {
    this.filters = {
      query: '',
      municipality: null,
      ownership: new Set(ALL_OWNERSHIP),
      visitedOnly: false,
    };
    this.selectedId = null;
    this.emit();
  }

  get isFiltered(): boolean {
    const f = this.filters;
    return (
      f.query !== '' ||
      f.municipality !== null ||
      f.visitedOnly ||
      f.ownership.size !== ALL_OWNERSHIP.length
    );
  }
}
