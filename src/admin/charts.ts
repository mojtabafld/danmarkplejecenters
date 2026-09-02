/**
 * The charts, as inline SVG.
 *
 * No chart library. Four shapes are needed and each is fifty lines of
 * arithmetic; a dependency to draw them would cost more bytes than the whole
 * admin bundle and would bring its own opinions about colour, which this page
 * has already decided.
 *
 * Colour comes from the token layer, never from literals here, and the two
 * series hues were validated rather than chosen: teal against ochre clears the
 * colour-vision separation floor in both themes, and every series is also
 * direct-labelled or legended, so nothing is carried by hue alone.
 *
 * All geometry is in a 0..W by 0..H user space with `preserveAspectRatio`
 * left at its default, so the SVG scales with its column and the labels scale
 * with it. Type is set in user units chosen to land near 11-13px at the sizes
 * these actually render.
 */

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type Point = { label: string; a: number; b?: number };

type Fmt = (n: number) => string;

/**
 * Round a maximum up to something a person would have chosen -- and, because
 * the axis is drawn in quarters, to a multiple of four.
 *
 * Without that last part the axis of a chart topping out at ten reads
 * 0, 3, 5, 8, 10: four labels rounded off a scale that was never divisible,
 * and two of them lies. These are counts of people and page views, so every
 * gridline should land on a whole one.
 */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * mag;
    if (candidate >= v) return Math.ceil(candidate / 4) * 4;
  }
  return 10 * mag;
}

/** Four gridlines at round values, which is what carries the unlabelled points. */
function ticks(max: number): number[] {
  return [0, max / 4, max / 2, (max * 3) / 4, max];
}

/**
 * Two series over time.
 *
 * A line rather than columns because thirty days is a shape, not thirty
 * separate quantities -- and one axis for both, because views and visitors are
 * the same unit. Two scales on one chart is the one thing never done here.
 */
export function lineChart(
  points: Point[],
  opts: { labelA: string; labelB?: string; fmt: Fmt },
): string {
  const W = 720;
  const H = 260;
  const padL = 46;
  const padR = 16;
  const padT = 14;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = niceMax(Math.max(1, ...points.flatMap((p) => [p.a, p.b ?? 0])));
  const x = (i: number): number =>
    points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW;
  const y = (v: number): number => padT + plotH - (v / max) * plotH;

  const path = (key: 'a' | 'b'): string =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key] ?? 0).toFixed(1)}`).join(' ');

  let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" `;
  out += `aria-label="${esc(opts.labelA)}${opts.labelB ? ` / ${esc(opts.labelB)}` : ''}">`;

  // Gridlines: hairline, solid, one step off the surface. They carry every
  // value that is not directly labelled.
  for (const t of ticks(max)) {
    out += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`;
    out += `<text class="tick" x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(opts.fmt(Math.round(t)))}</text>`;
  }

  // Dates: first, middle and last only. A tick under all thirty is a smear.
  for (const i of [0, Math.floor(points.length / 2), points.length - 1]) {
    const p = points[i];
    if (!p) continue;
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    out += `<text class="tick" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(p.label)}</text>`;
  }

  // A wash under the first series, never a saturated block.
  out +=
    `<path class="area" d="${path('a')} L${x(points.length - 1).toFixed(1)} ${padT + plotH} ` +
    `L${x(0).toFixed(1)} ${padT + plotH} Z"/>`;
  if (opts.labelB) out += `<path class="line line--b" d="${path('b')}"/>`;
  out += `<path class="line line--a" d="${path('a')}"/>`;

  // The end of each line is labelled, because the last value is the one being
  // asked about. Nothing else carries a number.
  const last = points[points.length - 1];
  if (last) {
    out += `<circle class="dot dot--a" cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.a).toFixed(1)}" r="4"/>`;
    if (opts.labelB !== undefined) {
      out += `<circle class="dot dot--b" cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.b ?? 0).toFixed(1)}" r="4"/>`;
    }
  }

  // One transparent band per day, so hovering anywhere in a column answers.
  for (let i = 0; i < points.length; i++) {
    const w = plotW / Math.max(1, points.length - 1);
    out +=
      `<rect class="hit" x="${(x(i) - w / 2).toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" ` +
      `height="${plotH}" data-i="${i}"/>`;
  }
  out += `<line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" hidden/>`;
  out += '</svg>';
  return out;
}

/** One value per day. Columns, because each day is its own quantity. */
export function columnChart(points: Point[], opts: { label: string; fmt: Fmt }): string {
  const W = 720;
  const H = 200;
  const padL = 46;
  const padR = 16;
  const padT = 14;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = niceMax(Math.max(1, ...points.map((p) => p.a)));
  const slot = plotW / points.length;
  // Capped, and never filling the slot: the leftover is the air between days.
  const bw = Math.min(18, slot - 3);

  let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label)}">`;
  for (const t of ticks(max)) {
    out += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`;
    out += `<text class="tick" x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(opts.fmt(Math.round(t)))}</text>`;
  }
  function y(v: number): number {
    return padT + plotH - (v / max) * plotH;
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const cx = padL + slot * i + slot / 2;
    const h = Math.max(p.a > 0 ? 2 : 0, plotH - (y(p.a) - padT));
    // Rounded at the data end, square at the baseline: the bar grows from the
    // axis and should look attached to it.
    out +=
      `<rect class="col" x="${(cx - bw / 2).toFixed(1)}" y="${(padT + plotH - h).toFixed(1)}" ` +
      `width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`;
    out +=
      `<rect class="hit" x="${(cx - slot / 2).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" ` +
      `height="${plotH}" data-i="${i}"/>`;
  }
  for (const i of [0, Math.floor(points.length / 2), points.length - 1]) {
    const p = points[i];
    if (!p) continue;
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    const cx = padL + slot * i + slot / 2;
    out += `<text class="tick" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(p.label)}</text>`;
  }
  return out + '</svg>';
}

/**
 * Ranked magnitudes. Horizontal, because the names are long and a column chart
 * would turn them into diagonal text nobody reads.
 *
 * One hue, not eight: these are the same measurement of different things, so
 * their identity is the label beside each bar, and giving each a colour would
 * invent eight categories that do not exist.
 */
export function rankedBars(
  rows: Array<{ label: string; value: number }>,
  opts: { fmt: Fmt; empty: string },
): string {
  if (!rows.length) return `<p class="quiet">${esc(opts.empty)}</p>`;
  const max = Math.max(...rows.map((r) => r.value), 1);
  let out = '<ul class="ranked">';
  for (const r of rows) {
    const pct = Math.round((r.value / max) * 100);
    out +=
      `<li class="ranked__row">` +
      `<span class="ranked__label" title="${esc(r.label)}">${esc(r.label)}</span>` +
      `<span class="ranked__track"><span class="ranked__fill" style="inline-size:${pct}%"></span></span>` +
      `<span class="ranked__value">${esc(opts.fmt(r.value))}</span>` +
      `</li>`;
  }
  return out + '</ul>';
}

/**
 * Part-to-whole across a handful of classes: one stacked bar, with a legend
 * and a direct label on every segment wide enough to hold one.
 */
export function stackedShare(
  rows: Array<{ label: string; value: number }>,
  opts: { fmt: Fmt; empty: string },
): string {
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (!total) return `<p class="quiet">${esc(opts.empty)}</p>`;

  let bar = '<div class="share">';
  let legend = '<ul class="legend">';
  rows.forEach((r, i) => {
    const pct = (r.value / total) * 100;
    // The label goes inside only where it fits; below that the legend carries
    // it. Clipping text inside a segment is worse than not labelling it.
    const inside = pct >= 16 ? `<span class="share__pct">${esc(Math.round(pct) + '%')}</span>` : '';
    bar +=
      `<span class="share__seg" data-series="${i}" style="inline-size:${pct.toFixed(2)}%" ` +
      `title="${esc(`${r.label}: ${opts.fmt(r.value)}`)}">${inside}</span>`;
    legend +=
      `<li class="legend__item"><span class="legend__key" data-series="${i}"></span>` +
      `${esc(r.label)} <span class="legend__n">${esc(opts.fmt(r.value))}</span></li>`;
  });
  return bar + '</div>' + legend + '</ul>';
}
