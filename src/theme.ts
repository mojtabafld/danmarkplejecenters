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
  private tintFrame: number | null = null;
  private listeners = new Set<(t: Theme) => void>();

  constructor() {
    this.current = stored() ?? deviceTheme();
    this.apply(this.current);
    window.addEventListener('pageshow', () => this.apply(this.current));

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
    const root = document.documentElement;
    root.setAttribute('data-theme', t);
    root.style.colorScheme = t;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', t);

    // Resolve the new theme synchronously. The page background also matters:
    // newer Safari versions can sample it for their browser chrome.
    const header = getComputedStyle(root).getPropertyValue('--header-bg').trim()
      || (t === 'dark' ? '#10131A' : '#FFFFFF');
    root.style.backgroundColor = header;
    if (document.body) document.body.style.backgroundColor = header;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    // Keep the parsed meta node and remove OS-specific media constraints.
    meta.removeAttribute('media');
    meta.content = header;
    this.refreshBrowserTint();
  }

  private refreshBrowserTint(): void {
    // Colour alone can leave WebKit's fixed-edge sample cached. Present one
    // changed geometry frame, then restore it; no navigation or scroll needed.
    if (this.tintFrame !== null) window.cancelAnimationFrame(this.tintFrame);
    const root = document.documentElement;
    root.setAttribute('data-browser-tint-refresh', '');
    this.tintFrame = window.requestAnimationFrame(() => {
      this.tintFrame = window.requestAnimationFrame(() => {
        root.removeAttribute('data-browser-tint-refresh');
        this.tintFrame = null;
      });
    });
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
