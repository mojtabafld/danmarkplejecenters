export type Theme = 'light' | 'dark';

const KEY = 'plejekort.theme';

/** Read a token off the live theme, so JS-drawn map layers stay themeable. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The device's own setting, which is what a visitor who has never touched the
 * toggle gets. Somebody who keeps their phone dark has said what they want
 * once, to the phone; asking them to say it again to every site is asking
 * twice. The toggle still wins where it has been used -- see `stored()` -- and
 * a choice made there is remembered.
 */
const DEVICE = window.matchMedia('(prefers-color-scheme: dark)');
const deviceTheme = (): Theme => (DEVICE.matches ? 'dark' : 'light');

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export class ThemeController {
  current: Theme;
  private listeners = new Set<(t: Theme) => void>();

  constructor() {
    this.current = stored() ?? deviceTheme();
    this.apply(this.current);

    /*
     * Follow the device while it is still the one deciding.
     *
     * A phone that turns itself dark at sunset should take this page with it,
     * mid-visit, without a reload. Once somebody has used the toggle their
     * choice is stored, and a stored choice outranks the device -- otherwise
     * the next sunset would quietly undo it.
     */
    DEVICE.addEventListener('change', () => {
      if (stored()) return;
      this.current = deviceTheme();
      this.apply(this.current);
      this.notify();
    });
  }

  private apply(t: Theme): void {
    document.documentElement.setAttribute('data-theme', t);
    document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute('content', t === 'dark' ? 'dark light' : 'light dark');

    // The browser paints its own surfaces -- Safari's address bar, Android's
    // status bar -- from theme-color, and it does not follow data-theme. Left
    // alone it stays white while the app goes dark, and the seam is obvious on
    // a phone. Read from the live theme rather than restated here, so it can
    // never drift from the header it is continuous with.
    const header = getComputedStyle(document.documentElement)
      .getPropertyValue('--header-bg')
      .trim();
    if (header) {
      // Edited in place, never replaced.
      //
      // This used to swap the element for a fresh one, on the theory that
      // Safari would not re-sample a content attribute changed in place. It
      // does -- WebKit watches the meta it parsed and reacts to that element's
      // content changing -- and the swap was throwing that element away on the
      // very first apply(), at boot, before anybody had touched the toggle.
      // From then on the browser was watching a node no longer in the
      // document, so the address bar and the notch strip kept the colour they
      // were given at load and only caught up on a reload. Which is exactly
      // the symptom this was meant to prevent.
      //
      // So: find the parsed meta and set its content. The element in the
      // markup keeps its identity for the life of the page.
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) {
        // Only if the markup lost it. Created once and then kept, for the same
        // reason -- a node the browser has registered is worth more than a
        // fresh one.
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', header);
    }
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.current);
  }

  onChange(fn: (t: Theme) => void): void {
    this.listeners.add(fn);
  }

  toggle(): void {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    this.apply(this.current);
    try {
      localStorage.setItem(KEY, this.current);
    } catch {
      /* private mode — the theme still applies for this session */
    }
    this.notify();
  }
}
