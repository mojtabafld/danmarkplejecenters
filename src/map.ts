import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MLMap,
} from 'maplibre-gl';

import { ownershipGroup } from './format';
import {
  HOME_BOX,
  REGION_EXTENT,
  boxOf,
  regionOf,
  unionBox,
  type Box,
  type Region,
} from './regions';
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

/**
 * The default view: whatever the shipped extract actually covers.
 *
 * It used to be a hard-coded box around Greater Copenhagen, which was correct
 * for exactly one dataset. Deriving it means the map frames Copenhagen while
 * the extract is Copenhagen and frames the country once the extract is the
 * country, with nothing here to remember to change. See src/regions.ts.
 */
export const HOME_BOUNDS: LngLatBoundsLike = HOME_BOX;

/**
 * Opening camera, refined to HOME_BOUNDS as soon as the transform is sized.
 *
 * Derived from the same box for the same reason, and deliberately a little
 * wider than the fit that follows: opening too far in and zooming out reads as
 * a mistake being corrected, while opening slightly out and settling in reads
 * as the map arriving.
 */
const HOME_CENTER: [number, number] = [
  (HOME_BOX[0][0] + HOME_BOX[1][0]) / 2,
  (HOME_BOX[0][1] + HOME_BOX[1][1]) / 2,
];
/*
 * Web Mercator at the equator fits 360 degrees of longitude across 512px at
 * zoom 1, halving with each level; the cosine corrects for the meridians
 * converging at Denmark's latitude. One level is subtracted so the opening
 * frame is wider than the target rather than narrower.
 */
const HOME_ZOOM = Math.max(
  3,
  Math.min(
    11,
    Math.log2(
      (360 * Math.cos((HOME_CENTER[1] * Math.PI) / 180)) / (HOME_BOX[1][0] - HOME_BOX[0][0]),
    ) - 1,
  ),
);

const SRC = 'plejecentre';
const USER_SRC = 'user-location';

/**
 * The saved ring's radius, at the zoom steps the ring itself uses. Shared,
 * because the ripple has to leave from exactly where the ring is drawn -- a
 * wave that starts anywhere else reads as a second, unrelated mark.
 */
const RING_STOPS: ReadonlyArray<readonly [number, number]> = [
  [9, 9],
  [12, 11],
  [15, 14],
];

/**
 * The ring, optionally scaled by an expression.
 *
 * The scale is folded into each zoom stop rather than multiplied over the
 * whole thing, because a `zoom` interpolation is only legal at the top of an
 * expression. Wrapped in arithmetic it is not an error you can see -- MapLibre
 * refuses the paint value and keeps the old one, so the ripple simply sat at
 * its starting radius and pulsed in place. Measuring the rendered frames is
 * what caught it: the moving pixels never got further than 12px from the dot.
 */
function ringRadius(scale?: ExpressionSpecification): ExpressionSpecification {
  const out: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [zoom, radius] of RING_STOPS) {
    out.push(zoom, scale ? ['*', radius, scale] : radius);
  }
  return out as ExpressionSpecification;
}

const RING_RADIUS = ringRadius();

/**
 * The ripple that runs when the map narrows to saved places.
 *
 * Two rings rather than one, the second trailing the first, because a single
 * expanding circle reads as a glitch while two read as a pulse. Per-dot delay
 * on top of that, so the map answers as a wave rather than a flashbulb -- and
 * capped, so a hundred saved places still finish inside a second.
 */
const RIPPLE_LAYERS = ['pin-ripple-a', 'pin-ripple-b'] as const;
const RIPPLE_WAVE = 1100;
const RIPPLE_OFFSET = 520;
const RIPPLE_STAGGER = 45;
const RIPPLE_STAGGER_CAP = 20;
const RIPPLE_GROWTH = 2.2;
/**
 * A ring alone is a hairline, and a hairline crossing a map is not a signal --
 * measured against a still frame, the first attempt moved a pixel by 15 parts
 * in 255, which is to say it was invisible. The wave carries a wash inside it
 * as well as an edge, and both fade on the way out.
 */
const RIPPLE_PEAK = 0.9;
const RIPPLE_FILL = 0.12;
const RIPPLE_STROKE = 3.5;

/** No cross-fade: see the note where the ripple layers are added. */
const INSTANT = { duration: 0, delay: 0 };

/** The ring's own answer: one soft swell, out and back. */
const POP = 0.16;
const POP_MS = 620;

const PULSE_TOTAL = RIPPLE_OFFSET + RIPPLE_STAGGER * RIPPLE_STAGGER_CAP + RIPPLE_WAVE;

/** How long the camera takes to pull back to the whole region. */
const HOME_MS = 620;
/** Longer than a card focus: this crosses the country, and should be read as travel. */
const REGION_MS = 900;
/**
 * How far in the saved-places view is allowed to go.
 *
 * Tighter than a single card's 14.5, because this frames a set rather than
 * picking one out of it: at street level the ripple has nothing around it to
 * be a ripple against.
 */
const SAVED_MAX_ZOOM = 12;

/**
 * And how close the map gets when it is showing a part of the country to
 * browse rather than a shortlist to read.
 *
 * Shared by the landsdel picker and by letting go of the saved filter, so the
 * two arrive at the same view: releasing the filter with Sjælland still chosen
 * leaves exactly the camera choosing Sjælland would have given.
 */
const BROWSE_MAX_ZOOM = 11;

/**
 * Which box covers the parts of the country a set of saved places falls in.
 *
 * One part, and it is that part's extent. Several, and it is all of them
 * together. Nothing saved, or nothing placeable, and it is the whole extract,
 * which is where the map opens anyway.
 *
 * A place whose municipality the landsdel table does not recognise cannot be
 * filed under a part, and rather than drop it out of the frame its own
 * position joins the union: the reader saved it, so it is on screen.
 */
function savedFocusBox(saved: readonly Plejecenter[]): Box {
  if (saved.length === 0) return HOME_BOX;

  const parts = new Set<Region>();
  const strays: Plejecenter[] = [];
  for (const p of saved) {
    const r = regionOf(p);
    if (r) parts.add(r);
    else strays.push(p);
  }

  const boxes = [...parts].map((r) => REGION_EXTENT[r]);
  const strayBox = boxOf(strays);
  if (strayBox) boxes.push(strayBox);
  return unionBox(boxes) ?? HOME_BOX;
}

/**
 * Somebody who has asked for less motion gets the state without the show: the
 * filter still narrows the map, the ring still marks the dots, nothing moves.
 */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

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
  // Saved places are numbered as they go in. The ripple reads that number to
  // stagger itself; without it every ring would leave at the same instant,
  // which is a flash rather than a wave.
  let vIndex = 0;
  return {
    type: 'FeatureCollection',
    features: items.map((p) => {
      const visited = isVisited(p.id);
      return {
        type: 'Feature',
        id: p.id,
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id,
          name: p.name,
          group: ownershipGroup(p),
          visited,
          vIndex: visited ? vIndex++ : 0,
        },
      };
    }),
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
  /** Frame handle for the saved-places ripple; null when nothing is running. */
  private pulse: number | null = null;
  /** Timer waiting for the camera to settle before the ripple starts. */
  private pulseWait: number | null = null;
  /** The `moveend` listener that same wait is racing, so it can be removed. */
  private pulseOnMove: (() => void) | null = null;
  /**
   * Bumped every time a run is called off.
   *
   * A cancelled run has two ways back to life -- its timer and its `moveend`
   * listener -- and clearing one is not clearing the other. Rather than trust
   * that every future path remembers to unhook itself, each armed run captures
   * this number and refuses to start if it has moved on.
   */
  private pulseToken = 0;

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
   * A marked plejecenter keeps its operator colour. Greying the dot did
   * separate the shortlist, but it read as disabled and it threw away the one
   * thing the map is colour-coded to say. The grey ring around it carries
   * "marked" on its own, as a shape rather than a repaint.
   */
  /**
   * A saved place is blue; everything else is coloured by who runs it.
   *
   * The saved case has to come first, or the operator match would answer for
   * every dot and the flag would never be read.
   */
  private markColor(): ExpressionSpecification {
    return [
      'case',
      ['==', ['get', 'visited'], true],
      token('--map-visited-dot'),
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

    // The ripple rings. They live here rather than being added on demand so
    // they survive a basemap swap, and they rest at zero opacity: the layer is
    // always present, and only the paint moves.
    for (const id of RIPPLE_LAYERS) {
      map.addLayer({
        id,
        type: 'circle',
        source: SRC,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'visited'], true]],
        paint: {
          'circle-color': token('--map-visited-dot'),
          'circle-opacity': 0,
          'circle-radius': RING_RADIUS,
          'circle-stroke-width': RIPPLE_STROKE,
          'circle-stroke-color': token('--map-visited-ring'),
          'circle-stroke-opacity': 0,
          // MapLibre cross-fades a changed paint property over 300ms by
          // default. That is right for a value that changes once and wrong for
          // one driven frame by frame, which would spend its whole life
          // catching up. These take their values immediately.
          'circle-radius-transition': INSTANT,
          'circle-opacity-transition': INSTANT,
          'circle-stroke-width-transition': INSTANT,
          'circle-stroke-opacity-transition': INSTANT,
        },
      });
    }

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
        'circle-radius': RING_RADIUS,
        'circle-radius-transition': INSTANT,
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

  /* ------------------------------------------------------- saved ripple -- */

  /**
   * Called when the map narrows to saved places, and again when it opens back
   * up. Narrowing sends a ripple out from every saved dot; opening up stops it.
   *
   * The point is not decoration. Filtering to saved places removes most of the
   * dots, and a map that loses a hundred marks in one frame reads as a map that
   * broke. The ripple says the opposite: these are the ones that are left, and
   * they are here on purpose. It runs once and stops -- a map that pulses
   * forever is a map nobody can read a street name on.
   */
  /**
   * Narrow the map to the part of the country the saved places are in, then
   * set them rippling.
   *
   * The part, not the places. Somebody with three saved plejecentre in
   * Copenhagen is shown Sjælland -- all of it, out to Bornholm -- rather than
   * a tight box around three dots. Framing the dots was the first attempt and
   * it answers a different question: it shows you what you saved, where this
   * shows you where what you saved is. The second is what somebody planning a
   * move is actually asking, and it leaves the rest of the landsdel on screen
   * with its other plejecentre in it.
   *
   * Saved places in more than one part cover all of those parts, by union.
   * There is no sense in which two of three landsdele can be narrowed to one.
   *
   * `released` is where the camera goes when the filter comes off: the whole
   * country normally, or the part of it still chosen in the picker. Passed in
   * rather than worked out here, because what is on the map without this
   * filter is a question about all the other filters, and those live in the
   * store.
   */
  setSavedFocus(
    on: boolean,
    saved: readonly Plejecenter[] = [],
    released: Box = HOME_BOX,
  ): void {
    this.run((m) => {
      this.stopPulse(m);

      // Letting go puts the camera back where the filter found it: the whole
      // country, or the part of it that is still chosen. Leaving it zoomed on
      // the landsdel was the old behaviour and it stranded the reader -- every
      // dot in Denmark was back on the map and they could see one corner of
      // them, with nothing to say the map had widened underneath. The move out
      // is the thing that says the filter is off.
      if (!on) {
        m.fitBounds(released, {
          padding: 56,
          maxZoom: BROWSE_MAX_ZOOM,
          duration: REDUCED.matches ? 0 : HOME_MS,
          essential: true,
        });
        return;
      }

      // The camera moves first.
      //
      // Somebody zoomed into one street who asks for their saved places is
      // asking to see them, and most of them are somewhere else. Without this
      // the filter emptied the visible map and the ripple ran off-screen: an
      // animation nobody watches, on a map that looks broken. Framing them
      // puts every saved place on screen before anything moves.
      const still = REDUCED.matches;
      m.fitBounds(savedFocusBox(saved), {
        padding: 56,
        maxZoom: SAVED_MAX_ZOOM,
        duration: still ? 0 : HOME_MS,
      });
      if (still) return;

      // And the ripple waits for it. Rings expanding while the camera is still
      // flying would slide across the screen as they grow, which reads as a
      // wobble rather than a pulse.
      //
      // `moveend` is the honest signal, but it never arrives if another camera
      // move interrupts this one -- so a timer backs it up and whichever comes
      // first wins.
      const token = this.pulseToken;
      let started = false;
      const begin = (): void => {
        // Not twice, and not at all if the filter was released while the
        // camera was still flying: the ripple would then run over a map
        // showing all of them again, which says the opposite of what it means.
        if (started || token !== this.pulseToken) return;
        started = true;
        this.clearWait(m);
        this.runPulse();
      };
      this.pulseOnMove = begin;
      m.on('moveend', begin);
      this.pulseWait = window.setTimeout(begin, HOME_MS + 120);
    });
  }

  /** The ripple itself, once the camera is where it is going to stay. */
  private runPulse(): void {
    const start = performance.now();
    const step = (now: number): void => {
      const map = this.map;
      // A basemap swap rebuilds every layer. If the frame lands in that gap
      // there is nothing to paint, and the run is over rather than wrong.
      if (!map || !map.getLayer(RIPPLE_LAYERS[0])) {
        this.pulse = null;
        return;
      }
      const t = now - start;
      this.paintPulse(map, t);
      if (t < PULSE_TOTAL) {
        this.pulse = requestAnimationFrame(step);
      } else {
        this.pulse = null;
        this.restPulse(map);
      }
    };
    this.pulse = requestAnimationFrame(step);
  }

  /**
   * One frame of it, as paint expressions.
   *
   * Everything per-dot is expressed rather than looped: `vIndex` is on the
   * feature, so the delay, the growth and the fade are all evaluated by the
   * renderer. What changes each frame is a single number, `t`.
   */
  private paintPulse(m: MLMap, t: number): void {
    const delay: ExpressionSpecification = [
      '*',
      RIPPLE_STAGGER,
      ['min', RIPPLE_STAGGER_CAP, ['get', 'vIndex']],
    ];

    RIPPLE_LAYERS.forEach((id, i) => {
      if (!m.getLayer(id)) return;
      // Where this dot's ring is in its life, from 0 to 1. Outside that range
      // the ring is not born yet or is already spent, and draws nothing.
      const local: ExpressionSpecification = [
        '/',
        ['-', ['-', t, i * RIPPLE_OFFSET], delay],
        RIPPLE_WAVE,
      ];
      const p: ExpressionSpecification = ['max', 0, ['min', 1, local]];
      // Out fast, then settling -- a ring that expands linearly reads as
      // mechanical, and one that eases out reads as something arriving.
      const eased: ExpressionSpecification = ['-', 1, ['^', ['-', 1, p], 3]];

      // A short ramp on the way in, so the ring appears rather than blinks.
      const alive: ExpressionSpecification = ['all', ['>', local, 0], ['<', local, 1]];
      const ramp: ExpressionSpecification = ['min', 1, ['*', 6, p]];

      m.setPaintProperty(id, 'circle-radius', ringRadius(['+', 1, ['*', RIPPLE_GROWTH, eased]]));
      m.setPaintProperty(id, 'circle-stroke-width', [
        '*',
        RIPPLE_STROKE,
        ['-', 1, ['*', 0.55, eased]],
      ]);
      // The fade runs on `p`, not on the eased radius. Fading with the easing
      // put the ring at its faintest exactly when it was at its widest, which
      // is the one moment it has anything to say.
      m.setPaintProperty(id, 'circle-stroke-opacity', [
        'case',
        alive,
        ['*', RIPPLE_PEAK, ['*', ramp, ['^', ['-', 1, p], 1.2]]],
        0,
      ]);
      // The wash recedes faster than the edge, so what travels outward is a
      // ring rather than a growing blob.
      m.setPaintProperty(id, 'circle-opacity', [
        'case',
        alive,
        ['*', RIPPLE_FILL, ['*', ramp, ['^', ['-', 1, p], 2.6]]],
        0,
      ]);
    });

    // The ring's own swell: out and back on a sine, which returns to exactly
    // where it started without needing to be put back.
    if (m.getLayer('pin-visited')) {
      const q: ExpressionSpecification = [
        'max',
        0,
        ['min', 1, ['/', ['-', t, delay], POP_MS]],
      ];
      m.setPaintProperty(
        'pin-visited',
        'circle-radius',
        ringRadius(['+', 1, ['*', POP, ['sin', ['*', Math.PI, q]]]]),
      );
    }
  }

  /** Drop whatever is still waiting to start a run. */
  private clearWait(m: MLMap): void {
    if (this.pulseWait !== null) {
      window.clearTimeout(this.pulseWait);
      this.pulseWait = null;
    }
    if (this.pulseOnMove) {
      m.off('moveend', this.pulseOnMove);
      this.pulseOnMove = null;
    }
  }

  /** Stop mid-flight, and leave the map exactly as it would have ended. */
  private stopPulse(m: MLMap): void {
    // Anything already armed is now stale, whichever way it was going to fire.
    this.pulseToken += 1;
    if (this.pulse !== null) {
      cancelAnimationFrame(this.pulse);
      this.pulse = null;
    }
    this.clearWait(m);
    this.restPulse(m);
  }

  private restPulse(m: MLMap): void {
    for (const id of RIPPLE_LAYERS) {
      if (!m.getLayer(id)) continue;
      m.setPaintProperty(id, 'circle-radius', RING_RADIUS);
      m.setPaintProperty(id, 'circle-stroke-width', RIPPLE_STROKE);
      m.setPaintProperty(id, 'circle-stroke-opacity', 0);
      m.setPaintProperty(id, 'circle-opacity', 0);
    }
    if (m.getLayer('pin-visited')) {
      m.setPaintProperty('pin-visited', 'circle-radius', RING_RADIUS);
    }
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
    this.run((m) => m.fitBounds(HOME_BOUNDS, { padding: 48, duration: HOME_MS }));
  }

  /**
   * Move to a named box -- the whole country, or one part of it.
   *
   * `maxZoom` is what stops a part holding a single plejecentre from becoming
   * a street view: the reader asked to see a region, and a region that fills
   * the screen at building scale is not one.
   */
  fitBox(box: Box, opts: { instant?: boolean } = {}): void {
    this.run((m) => {
      m.fitBounds(box, {
        padding: 56,
        maxZoom: BROWSE_MAX_ZOOM,
        duration: opts.instant || REDUCED.matches ? 0 : REGION_MS,
        essential: true,
      });
    });
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
