/**
 * "Where am I" on the map.
 *
 * Geolocation is the one feature here that is guaranteed to fail for some
 * people: they decline the prompt, the device has location switched off, the
 * page is served over plain http, the fix times out indoors. Every one of those
 * is a distinct message with a way forward, never a silent no-op on a button.
 */

export type GeoStatus =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'found'; lat: number; lon: number; accuracy: number }
  | { kind: 'error'; reason: 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'unsupported' };

type Listener = (s: GeoStatus) => void;

export class Geolocator {
  status: GeoStatus = { kind: 'idle' };
  private listeners = new Set<Listener>();
  private watchId: number | null = null;

  onChange(fn: Listener): void {
    this.listeners.add(fn);
  }

  private set(status: GeoStatus): void {
    this.status = status;
    for (const fn of this.listeners) fn(status);
  }

  get isActive(): boolean {
    return this.status.kind === 'locating' || this.status.kind === 'found';
  }

  /**
   * Start watching. `watchPosition` rather than a single fix: the first reading
   * indoors is often a coarse network estimate, and the GPS refinement that
   * follows a few seconds later is the one worth showing.
   */
  start(): void {
    if (!('geolocation' in navigator)) {
      this.set({ kind: 'error', reason: 'unsupported' });
      return;
    }
    // Chrome and Safari reject geolocation outside a secure context, and the
    // rejection arrives as a generic error. Naming it up front is more useful.
    if (!window.isSecureContext) {
      this.set({ kind: 'error', reason: 'insecure' });
      return;
    }

    this.set({ kind: 'locating' });

    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        this.set({
          kind: 'found',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Math.max(1, Math.round(pos.coords.accuracy)),
        }),
      (err) => {
        this.stop();
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        this.set({ kind: 'error', reason });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  clear(): void {
    this.stop();
    this.set({ kind: 'idle' });
  }

  toggle(): void {
    if (this.isActive) this.clear();
    else this.start();
  }
}

/** Great-circle distance in kilometres, for "3.2 km from you" in the panel. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
