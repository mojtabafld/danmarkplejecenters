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
    const meta = document.querySelector('meta[name="theme-color"]');
    if (header && meta) {
      // Replaced, not edited. Safari does not reliably re-sample a theme-color
      // whose content attribute was changed in place: the address bar and the
      // status bar keep the colour they were given at load, so the app goes
      // dark and the chrome above it stays white. Swapping the element makes it
      // read the new value.
      const next = document.createElement('meta');
      next.setAttribute('name', 'theme-color');
      next.setAttribute('content', header);
      meta.replaceWith(next);
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
