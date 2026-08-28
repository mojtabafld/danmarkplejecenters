export type Theme = 'light' | 'dark';

const KEY = 'plejekort.theme';

/** Read a token off the live theme, so JS-drawn map layers stay themeable. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The theme a first-time visitor gets. Light, not the operating system's
 * setting: this is a daytime reference tool that people open to read an address
 * and a phone number, and the light map carries far more legible detail than
 * the dark one. Dark is one click away and is remembered once chosen.
 */
const DEFAULT_THEME: Theme = 'light';

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
    this.current = stored() ?? DEFAULT_THEME;
    this.apply(this.current);
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
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', header);
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
