/**
 * The drag that moves a bottom sheet between two resting places.
 *
 * Two sheets want the same gesture and mean slightly different things by it.
 * The detail card has `peek` (the name and the first facts) and `full` (all of
 * it), and a pull down past peek puts it away. The result rail has `peek` (a
 * strip with the count on it) and `full` (the list), and a pull down past peek
 * does nothing -- there is nowhere for the rail to go, and a list you cannot
 * get back is worse than one in the way.
 *
 * That difference is the `onDismiss` option. Everything else is shared, which
 * is the point: one gesture, described once, so the two sheets cannot drift
 * into feeling different.
 *
 * Both are laid out at their full height and the peek state is that same box
 * translated down, so a drag moves one composited layer rather than relaying
 * out the sheet on every frame. The offsets live in the stylesheet; this reads
 * one number back from it, through a probe, for the arithmetic the gesture
 * needs. See `measure()`.
 */

/** Below the breakpoint these are sheets. Above it they are columns. */
const SHEET = window.matchMedia('(max-width: 60rem)');

/** How far down, as a share of the sheet's height, counts as "put it away". */
const DISMISS_FRACTION = 0.28;
/** Or a flick: px per millisecond, regardless of how far it got. */
const DISMISS_VELOCITY = 0.5;
/**
 * Below this much hidden content there is no expanded state worth having.
 *
 * A record with a phone number and nothing else is shorter than the peek
 * height, and a sheet that can be pulled up by nine pixels feels broken rather
 * than short. Those get no detents and only drag downwards, which is what the
 * detail card did before any of this existed.
 */
const DETENT_MIN_TRAVEL = 48;

export interface SheetOptions {
  /** The sheet itself. Carries data-detent and data-dragging. */
  root: HTMLElement;
  /** The bar the finger goes on. */
  grip: HTMLElement;
  /** A zero-width box whose height is the peek detent. */
  probe: HTMLElement | null;
  /** Called when the sheet is pulled past peek. Omit for one that only collapses. */
  onDismiss?: () => void;
  /**
   * Where a sheet rests when it first appears. The detail card opens at `peek`,
   * because the map behind it is the thing being annotated; the rail opens at
   * `full`, because it is the list and nobody asked for it to be put away.
   */
  opensAt?: 'peek' | 'full';
  /** Whether the sheet is currently in play at all -- hidden cards do not drag. */
  active?: () => boolean;
  /**
   * Called whenever the sheet moves, including on every frame of a drag.
   *
   * A translate does not change offsetHeight and does not fire a
   * ResizeObserver, so anything positioned against this sheet has no other way
   * to know it moved. The dock floats above the rail and would otherwise stay
   * where a full-height rail used to be.
   */
  onMove?: () => void;
}

export class Sheet {
  /** How far down the sheet sits at `peek`, in px. 0 means no detents. */
  private shift = 0;

  constructor(private o: SheetOptions) {
    this.arm();
  }

  /** True while the sheet has two resting places to move between. */
  get hasDetents(): boolean {
    return this.shift > 0;
  }

  /**
   * Put the sheet at a resting place and work out how far down `peek` is.
   *
   * `initial` is a sheet arriving, which always starts at peek. One already on
   * screen keeps whatever the reader put it in -- re-rendering after a note is
   * saved or a filter changes should not shove it under their thumb.
   */
  settle(initial: boolean): void {
    const { root, probe } = this.o;
    if (!SHEET.matches) {
      delete root.dataset.detent;
      this.shift = 0;
      return;
    }

    const detent = initial
      ? (this.o.opensAt ?? 'peek')
      : root.dataset.detent === 'full'
        ? 'full'
        : 'peek';
    /*
     * The peek height, off the probe.
     *
     * Neither of the two obvious routes works. A custom property computes to
     * its own token stream, so --sheet-peek reads back as the literal text
     * "min(22rem, 50svh)". A translate keeps its percentage unresolved, so the
     * rule reads back as "calc(0px + (0 * max(0px, 100% - 352px)))". Neither
     * parses to a number. The probe is a real box with a real used height.
     */
    const peek = probe?.offsetHeight ?? 0;
    this.shift = Math.max(0, root.getBoundingClientRect().height - peek);

    if (this.shift < DETENT_MIN_TRAVEL) {
      delete root.dataset.detent;
      this.shift = 0;
      return;
    }
    root.dataset.detent = detent;
    this.o.onMove?.();
  }

  /** Move to a resting place without a finger being involved. */
  restAt(detent: 'peek' | 'full'): void {
    if (!this.hasDetents) return;
    this.o.root.style.translate = '';
    this.o.root.dataset.detent = detent;
  }

  private arm(): void {
    const { root, grip, onDismiss, active } = this.o;

    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let base = 0;
    let offset = 0;
    let dragging = false;

    grip.addEventListener('pointerdown', (e) => {
      if (!SHEET.matches) return;
      if (active && !active()) return;
      dragging = true;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      base = offset = root.dataset.detent === 'full' ? 0 : this.shift;
      root.dataset.dragging = 'true';
      grip.setPointerCapture(e.pointerId);
    });

    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      // Upwards stops at the full height. Past that a bottom sheet is a rubber
      // band on iOS and an empty gap here, so it simply does not go.
      offset = Math.max(0, base + (e.clientY - startY));
      // And downwards stops at peek where there is nothing to dismiss to,
      // otherwise the rail could be dragged off the bottom of the screen.
      if (!onDismiss) offset = Math.min(offset, this.shift);
      lastY = e.clientY;
      lastT = e.timeStamp;
      // Inline, so it beats the stylesheet's resting rule while the finger is
      // down.
      root.style.translate = `0 ${offset}px`;
      this.o.onMove?.();
    });

    const release = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
      delete root.dataset.dragging;

      const height = root.getBoundingClientRect().height || 1;
      const elapsed = Math.max(1, e.timeStamp - lastT);
      const velocity = (e.clientY - lastY) / elapsed;
      const flickedDown = velocity > DISMISS_VELOCITY;
      const flickedUp = velocity < -DISMISS_VELOCITY;
      const atFull = root.dataset.detent === 'full';

      // Dismissal is measured from the lowest resting place, so a pull down
      // from `full` lands on `peek` rather than closing outright.
      if (onDismiss && (offset - this.shift > height * DISMISS_FRACTION || (flickedDown && !atFull))) {
        // The inline translate stays where the finger left it, so the exit
        // carries on from there rather than snapping back first.
        onDismiss();
        return;
      }

      // Handing the offset back to the stylesheet is what makes the snap
      // animate: the inline value goes, the detent rule applies, and the
      // transition runs between them.
      root.style.translate = '';
      if (this.shift === 0) return void this.o.onMove?.();
      if (flickedUp) root.dataset.detent = 'full';
      else if (flickedDown) root.dataset.detent = 'peek';
      else root.dataset.detent = offset < this.shift / 2 ? 'full' : 'peek';
      // After the snap has been decided, and again once it has run, because
      // the resting height is only true at the end of the transition.
      this.o.onMove?.();
      window.setTimeout(() => this.o.onMove?.(), 260);
    };

    grip.addEventListener('pointerup', release);
    grip.addEventListener('pointercancel', release);

    // Turning the phone changes the height the peek offset is a share of, and
    // crossing the breakpoint takes the detents away entirely.
    window.addEventListener('resize', () => {
      if (!dragging && (!active || active())) this.settle(false);
    });
  }
}
