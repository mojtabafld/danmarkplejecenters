export type Ownership = 'Kommunal' | 'Selvejende' | 'Privat' | 'Friplejebolig' | 'Ukendt';

export interface Plejecenter {
  /** Stable id from the national register. */
  id: string;
  name: string;
  /** Street + house number, as registered. */
  street: string;
  postcode: string;
  /** Postal town from the official address register, not free text. */
  city: string;
  /** Municipality name without the trailing " Kommune". */
  municipality: string;
  phone: string | null;
  email: string | null;
  web: string | null;
  ownership: Ownership;
  /** Number of care homes (boliger), where the operator has reported it. */
  homes: number | null;
  lat: number;
  lon: number;
}

/** The three buckets shown on the map. Friplejebolig and Privat share one. */
export type OwnershipGroup = 'Kommunal' | 'Selvejende' | 'Privat';

export interface Filters {
  query: string;
  municipality: string | null;
  ownership: Set<OwnershipGroup>;
  /** Show only what the signed-in reader has marked visited. */
  visitedOnly: boolean;
}
