export type Theme = 'light' | 'dark';

const KEY = 'plejekort.theme';

/** Read a token off the live theme, so JS-drawn map layers stay themeable. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The device decides. Somebody who keeps their phone dark has said what they
 * want once, to the phone; this page follows it on every visit, and follows it
 * again mid-visit when the phone switches at sunset.
 *
 * The toggle is a moment's override, not a setting: it lasts for this tab
 * (sessionStorage) and is dropped as soon as the device changes its mind or the
 * page is opened fresh. It used to be kept in localStorage and outrank the
 * device for good, which meant one tap -- often an accidental one -- left
 * somebody on a light page under a dark phone with no way to see why.
 */
const DEVICE = window.matchMedia('(prefers-color-scheme: dark)');
const deviceTheme = (): Theme => (DEVICE.matches ? 'dark' : 'light');

// Retire the old permanent choice, so readers who once tapped the toggle get
// their device's theme back. The inline script in index.html does the same
// before first paint; this covers a page restored from the back/forward cache.
try {
  localStorage.removeItem(KEY);
} catch {
  /* storage blocked: nothing was kept there either */
}

function stored(): Theme | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function remember(t: Theme | null): void {
  try {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode — the theme still applies for this page */
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
     * A phone that turns itself dark at sunset takes this page with it,
     * mid-visit, without a reload -- and the device changing is the reader
     * changing their mind, so it also ends any override from the toggle.
     */
    DEVICE.addEventListener('change', () => {
      remember(null);
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
    // Toggling back to what the device says is the same as no override.
    remember(this.current === deviceTheme() ? null : this.current);
    this.notify();
  }
}
