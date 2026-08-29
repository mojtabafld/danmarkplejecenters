import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MLMap,
} from 'maplibre-gl';

import { ownershipGroup } from './format';
import { token, type Theme } from './theme';
import type { Plejecenter } from './types';

/**
 * Basemap: CARTO's OpenStreetMap-derived vector styles. Free, no API key, and
 * they ship a real light AND a real dark style — which is why they beat raster
 * OSM tiles here: the dark theme gets a dark map, not an inverted one.
 */
const STYLE: Record<Theme, string> = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

/** Greater Copenhagen, with a margin so the outer municipalities are not clipped. */
export const HOME_BOUNDS: LngLatBoundsLike = [
  [12.12, 55.52],
  [12.73, 55.95],
];

/** Opening camera, refined to HOME_BOUNDS as soon as the transform is sized. */
const HOME_CENTER: [number, number] = [12.425, 55.735];
const HOME_ZOOM = 9;

const SRC = 'plejecentre';
const USER_SRC = 'user-location';

/**
 * A circle on the ground, as a polygon. The accuracy radius is a distance in
 * metres, so it has to scale with zoom the way the map does; a fixed pixel
 * radius would claim 50m precision at street level and 50km at region level.
 */
function accuracyCircle(lat: number, lon: number, metres: number): GeoJSON.FeatureCollection {
  const steps = 64;
  const latRad = (lat * Math.PI) / 180;
  const dLat = metres / 111_320;
  const dLon = metres / (111_320 * Math.cos(latRad));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
  };
}

type Handlers = {
  onSelect(id: string): void;
  onDeselect(): void;
  /** Raised when the basemap cannot be reached, so the UI can say so. */
  onBasemapError(): void;
};

function toFeatureCollection(
  items: Plejecenter[],
  isVisited: (id: string) => boolean,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        group: ownershipGroup(p),
        visited: isVisited(p.id),
      },
    })),
  };
}

/**
 * Run once the element actually has a box. MapLibre measures its container at
 * construction, and a container that is still zero-height (stylesheet not
 * applied yet) leaves it with a 1px canvas that never finishes loading — a
 * black rectangle where the city should be.
 */
function whenSized(el: HTMLElement, run: () => void): void {
  if (el.clientHeight > 0 && el.clientWidth > 0) {
    run();
    return;
  }
  const ro = new ResizeObserver(() => {
    if (el.clientHeight > 0 && el.clientWidth > 0) {
      ro.disconnect();
      run();
    }
  });
  ro.observe(el);
}

export class PlejecenterMap {
  private map: MLMap | null = null;
  private ready = false;
  private pending: Plejecenter[] | null = null;
  private selectedId: string | null = null;
  private basemapFailed = false;
  private userMarker: maplibregl.Marker | null = null;
  private lastUserFix: { lat: number; lon: number; accuracy: number; label: string } | null = null;
  private lastVisited: (id: string) => boolean = () => false;

  /** Calls made before the map exists, replayed in order once it does. */
  private queued: Array<(m: MLMap) => void> = [];

  constructor(
    container: HTMLElement,
    theme: Theme,
    private handlers: Handlers,
  ) {
    // Construction waits for a real box. MapLibre reads the container's size
    // once, at construction, to compute both the canvas and the initial
    // `bounds`; if that read returns zero the map opens at world zoom and never
    // reaches its first idle frame — a black rectangle that no later resize()
    // recovers from.
    whenSized(container, () => this.create(container, theme));
  }

  private create(container: HTMLElement, theme: Theme): void {
    const map = new maplibregl.Map({
      container,
      style: STYLE[theme],
      // A safe starting camera. NOT `bounds:` — MapLibre resolves that against
      // a transform it has not sized yet, which warns "cannot fit within
      // canvas" and silently leaves the map at world zoom. Fitting after
      // construction, when the transform is real, is the reliable order.
      center: HOME_CENTER,
      zoom: HOME_ZOOM,
      attributionControl: false,
      keyboard: true,
    });
    this.map = map;
    map.resize();
    map.fitBounds(HOME_BOUNDS, { padding: 48, duration: 0 });

    // No MapLibre controls at all: NavigationControl and ScaleControl bring
    // their own styling and their own hit sizes, and the scale bar lands on top
    // of the legend. Zoom and reset are ordinary app buttons instead, so they
    // inherit the theme and the 24px target-size floor.

    map.on('load', () => {
      this.install();
      this.ready = true;
      if (this.pending) {
        this.setData(this.pending);
        this.pending = null;
      }
      for (const fn of this.queued) fn(map);
      this.queued = [];
    });

    // A tile CDN that is blocked or offline must not read as an empty city.
    // Surface it once, and let the app keep working from the list.
    map.on('error', (e) => {
      const url = (e as unknown as { error?: { url?: string } }).error?.url ?? '';
      if ((url.includes('cartocdn.com') || url.includes('basemaps')) && !this.basemapFailed) {
        this.basemapFailed = true;
        this.handlers.onBasemapError();
      }
    });

    // Keep the canvas correct afterwards: the rail collapses, the window
    // resizes, the phone rotates.
    new ResizeObserver(() => map.resize()).observe(container);
  }

  /** Run now if the map is live, otherwise as soon as it is. */
  private run(fn: (m: MLMap) => void): void {
    if (this.map && this.ready) fn(this.map);
    else this.queued.push(fn);
  }

  /** The MapLibre instance, once it exists. Null during the first frames. */
  get instance(): MLMap | null {
    return this.map;
  }

  /**
   * Colours come from the live theme, never from literals in this file.
   *
   * A marked plejecenter goes grey, ahead of its operator colour. That does
   * trade one piece of information for another on the map -- you can no longer
   * read the operator off a marked dot -- but the operator is still named in
   * the card, and telling your own shortlist apart at a glance is what the map
   * is being used for once you have one.
   */
  private markColor(): ExpressionSpecification {
    return [
      'case',
      ['==', ['get', 'visited'], true],
      token('--map-visited-fill'),
      this.groupColor(),
    ];
  }

  private groupColor(): ExpressionSpecification {
    return [
      'match',
      ['get', 'group'],
      'Kommunal',
      token('--cat-kommunal-mark'),
      'Selvejende',
      token('--cat-selvejende-mark'),
      'Privat',
      token('--cat-privat-mark'),
      token('--border-strong'),
    ];
  }

  private install(): void {
    const map = this.map!;
    map.addSource(SRC, {
      type: 'geojson',
      data: toFeatureCollection([], () => false),
      cluster: true,
      clusterRadius: 46,
      clusterMaxZoom: 13,
    });

    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: SRC,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': token('--map-cluster-bg'),
        'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 15, 12, 21, 40, 28],
        'circle-stroke-width': 2,
        'circle-stroke-color': token('--map-cluster-ring'),
      },
    });

    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: SRC,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': token('--map-cluster-fg') },
    });

    // Selection halo, drawn under the pin so the pin stays crisp.
    map.addLayer({
      id: 'pin-halo',
      type: 'circle',
      source: SRC,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], '']],
      paint: {
        'circle-radius': 16,
        'circle-color': token('--map-pin-selected-halo'),
        'circle-opacity': 0.28,
        'circle-stroke-width': 2,
        'circle-stroke-color': token('--map-pin-selected-halo'),
      },
    });

    map.addLayer({
      id: 'pins',
      type: 'circle',
      source: SRC,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': this.markColor(),
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 12, 7, 15, 9],
        'circle-stroke-width': 2,
        'circle-stroke-color': token('--map-pin-ring'),
      },
    });

    // Marked plejecentre get an outer ring. Deliberately a shape rather than a
    // fourth colour: the three operator hues already mean something, and the
    // ring reads as "one of yours" without arguing with them.
    map.addLayer({
      id: 'pin-visited',
      type: 'circle',
      source: SRC,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'visited'], true]],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 9, 12, 11, 15, 14],
        'circle-stroke-width': 2,
        'circle-stroke-color': token('--map-visited-ring'),
      },
    });

    // Names appear once the map is close enough for them not to collide.
    map.addLayer({
      id: 'pin-labels',
      type: 'symbol',
      source: SRC,
      filter: ['!', ['has', 'point_count']],
      minzoom: 12.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 12,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': token('--text-primary'),
        'text-halo-color': token('--surface-page'),
        'text-halo-width': 1.6,
      },
    });

    const hit = ['clusters', 'pins'];
    for (const id of hit) {
      map.on('mouseenter', id, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', id, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    map.on('click', 'pins', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) this.handlers.onSelect(id);
    });

    map.on('click', 'clusters', async (e) => {
      const f = e.features?.[0];
      const clusterId = f?.properties?.cluster_id as number | undefined;
      if (clusterId === undefined) return;
      const src = map.getSource(SRC) as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(clusterId);
      map.easeTo({
        center: (f!.geometry as GeoJSON.Point).coordinates as [number, number],
        zoom,
        duration: 420,
      });
    });

    // Clicking bare map clears the selection, which is what people expect.
    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: hit });
      if (hits.length === 0) this.handlers.onDeselect();
    });
  }

  /**
   * Which plejecentre are marked. Held here rather than passed with the data,
   * because setData is called from several places and the one that forgot the
   * argument silently unmarked everything: the ring simply stopped appearing.
   * One caller sets the predicate; every caller gets it.
   */
  setVisitedPredicate(isVisited: (id: string) => boolean): void {
    this.lastVisited = isVisited;
    if (this.pending) this.setData(this.pending);
  }

  setData(items: Plejecenter[]): void {
    this.pending = items;
    this.run((m) => {
      (m.getSource(SRC) as GeoJSONSource).setData(toFeatureCollection(items, this.lastVisited));
    });
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.run((m) => {
      m.setFilter('pin-halo', [
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'id'], id ?? ''],
      ]);
    });
  }

  /**
   * Fly to one plejecenter without zooming so far that context is lost.
   *
   * `bottomInset` is how many pixels at the bottom of the map are covered by
   * something else, which on a phone is the detail card. Centring the marker in
   * the container would put it behind that card: the offset lifts it into the
   * strip that is actually visible, which is the whole point of the card being
   * short.
   */
  focus(p: Plejecenter, bottomInset = 0): void {
    this.run((m) => {
      m.easeTo({
        center: [p.lon, p.lat],
        zoom: Math.max(m.getZoom(), 14.5),
        offset: [0, -bottomInset / 2],
        duration: 620,
        essential: true,
      });
    });
  }

  fitTo(items: Plejecenter[]): void {
    this.run((m) => {
      if (items.length === 0) {
        m.fitBounds(HOME_BOUNDS, { padding: 48, duration: 500 });
        return;
      }
      if (items.length === 1) {
        m.easeTo({ center: [items[0].lon, items[0].lat], zoom: 14.5, duration: 500 });
        return;
      }
      const b = new maplibregl.LngLatBounds();
      for (const p of items) b.extend([p.lon, p.lat]);
      m.fitBounds(b, { padding: 72, maxZoom: 14.5, duration: 500 });
    });
  }

  resetView(): void {
    this.run((m) => m.fitBounds(HOME_BOUNDS, { padding: 48, duration: 620 }));
  }

  /* ------------------------------------------------------- user location -- */

  /**
   * Two things are drawn: a translucent disc for the reported accuracy radius,
   * and an HTML marker for the point itself. The disc is a GeoJSON circle
   * because it must scale with the map (50m stays 50m at every zoom); the point
   * is HTML because its pulse is a CSS animation, which a WebGL circle layer
   * cannot have and which `prefers-reduced-motion` can therefore switch off.
   */
  showUserLocation(lat: number, lon: number, accuracy: number, label: string): void {
    this.lastUserFix = { lat, lon, accuracy, label };
    this.run((m) => {
      const disc = accuracyCircle(lat, lon, accuracy);

      const src = m.getSource(USER_SRC) as GeoJSONSource | undefined;
      if (src) {
        src.setData(disc);
      } else {
        m.addSource(USER_SRC, { type: 'geojson', data: disc });
        m.addLayer({
          id: 'user-accuracy',
          type: 'fill',
          source: USER_SRC,
          paint: {
            'fill-color': token('--map-user-accuracy'),
            'fill-opacity': 0.14,
          },
        });
        m.addLayer({
          id: 'user-accuracy-edge',
          type: 'line',
          source: USER_SRC,
          paint: {
            'line-color': token('--map-user-accuracy'),
            'line-opacity': 0.4,
            'line-width': 1,
          },
        });
      }

      if (!this.userMarker) {
        const el = document.createElement('div');
        el.className = 'user-dot';
        // A graphic that carries meaning ("you are here", and how precisely),
        // so it takes role="img" and a label. A bare div with aria-label is
        // prohibited ARIA and axe rejects it.
        el.setAttribute('role', 'img');
        // Three rings, staggered, so the pulse reads as a repeating ripple
        // rather than one blinking circle.
        el.innerHTML =
          '<span class="user-dot__ring"></span>' +
          '<span class="user-dot__ring"></span>' +
          '<span class="user-dot__ring"></span>' +
          '<span class="user-dot__core"></span>';
        this.userMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(m);
      } else {
        this.userMarker.setLngLat([lon, lat]);
      }
      this.userMarker.getElement().setAttribute('aria-label', label);
      this.userMarker.getElement().setAttribute('title', label);
    });
  }

  hideUserLocation(): void {
    this.lastUserFix = null;
    this.userMarker?.remove();
    this.userMarker = null;
    this.run((m) => {
      for (const id of ['user-accuracy-edge', 'user-accuracy']) {
        if (m.getLayer(id)) m.removeLayer(id);
      }
      if (m.getSource(USER_SRC)) m.removeSource(USER_SRC);
    });
  }

  /** Frame the user without losing the plejecentre around them. */
  focusUser(lat: number, lon: number, bottomInset = 0): void {
    this.run((m) => {
      m.easeTo({
        center: [lon, lat],
        zoom: Math.max(m.getZoom(), 13),
        offset: [0, -bottomInset / 2],
        duration: 700,
      });
    });
  }

  zoomBy(delta: number): void {
    this.run((m) => m.easeTo({ zoom: m.getZoom() + delta, duration: 240 }));
  }

  /** Swapping the basemap wipes custom layers, so reinstall them after. */
  setTheme(theme: Theme, items: Plejecenter[]): void {
    const m = this.map;
    if (!m || !this.ready) return;
    this.ready = false;
    m.setStyle(STYLE[theme]);
    m.once('styledata', () => {
      if (m.getSource(SRC)) return;
      this.install();
      this.ready = true;
      this.setData(items);
      this.setSelected(this.selectedId);
      for (const fn of this.queued) fn(m);
      this.queued = [];
      // setStyle drops every custom source, the accuracy disc included. The
      // marker is a DOM node and survives; the disc has to be re-added.
      if (this.lastUserFix) {
        const { lat, lon, accuracy, label } = this.lastUserFix;
        this.showUserLocation(lat, lon, accuracy, label);
      }
    });
  }
}
