/**
 * Accounts and the visited list, client side.
 *
 * The whole feature is optional. If the server has no database bound it
 * answers 503, and everything here reports itself unavailable so the interface
 * can leave the account button out rather than offer something that cannot
 * work. The map, the search and the cards never depend on any of it.
 */

export type AccountUser = { email: string };

export type AuthError =
  | 'bad_email'
  | 'too_short'
  | 'too_long'
  | 'email_taken'
  | 'bad_credentials'
  | 'too_many'
  | 'offline'
  | 'server_error';

type Listener = () => void;

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(path, {
    method,
    // Same-origin: the session cookie is HttpOnly and rides along on its own.
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* an empty or non-JSON body is fine; status carries the meaning */
  }
  return { status: res.status, data };
}

export class Account {
  user: AccountUser | null = null;
  /** Plejecenter ids this user has marked. Empty when signed out. */
  visited = new Set<string>();
  /** False when the server has no database, so the feature is hidden entirely. */
  available = true;

  private listeners = new Set<Listener>();

  onChange(fn: Listener): void {
    this.listeners.add(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Ask who we are. Runs once at start-up and decides whether to show anything. */
  async load(): Promise<void> {
    try {
      const { status, data } = await call('GET', '/api/auth/me');
      if (status === 503) {
        this.available = false;
        this.emit();
        return;
      }
      this.user = (data.user as AccountUser | null) ?? null;
    } catch {
      // A network failure is not the same as "no accounts here": keep the
      // feature visible so a reload can recover it.
      this.user = null;
    }
    if (this.user) await this.loadVisits();
    this.emit();
  }

  private async loadVisits(): Promise<void> {
    try {
      const { status, data } = await call('GET', '/api/visits');
      this.visited = status === 200 ? new Set(data.visits as string[]) : new Set();
    } catch {
      this.visited = new Set();
    }
  }

  private async credentials(
    path: '/api/auth/signin' | '/api/auth/signup',
    email: string,
    password: string,
  ): Promise<AuthError | null> {
    let status: number;
    let data: Record<string, unknown>;
    try {
      ({ status, data } = await call('POST', path, { email, password }));
    } catch {
      return 'offline';
    }
    if (status === 200 || status === 201) {
      this.user = data.user as AccountUser;
      await this.loadVisits();
      this.emit();
      return null;
    }
    return ((data.error as AuthError) ?? 'server_error');
  }

  signIn(email: string, password: string): Promise<AuthError | null> {
    return this.credentials('/api/auth/signin', email, password);
  }

  signUp(email: string, password: string): Promise<AuthError | null> {
    return this.credentials('/api/auth/signup', email, password);
  }

  async signOut(): Promise<void> {
    try {
      await call('POST', '/api/auth/signout');
    } catch {
      /* clear locally regardless: the cookie expires on its own */
    }
    this.user = null;
    this.visited = new Set();
    this.emit();
  }

  async deleteAccount(): Promise<boolean> {
    try {
      const { status } = await call('DELETE', '/api/auth/account');
      if (status !== 200) return false;
    } catch {
      return false;
    }
    this.user = null;
    this.visited = new Set();
    this.emit();
    return true;
  }

  isVisited(id: string): boolean {
    return this.visited.has(id);
  }

  /**
   * Toggle, applied locally first so the button answers immediately, and rolled
   * back if the server disagrees. A mark that silently failed would be worse
   * than one that visibly does nothing.
   */
  async toggleVisited(id: string): Promise<boolean> {
    if (!this.user) return false;
    const wasVisited = this.visited.has(id);
    if (wasVisited) this.visited.delete(id);
    else this.visited.add(id);
    this.emit();

    try {
      const { status } = await call(wasVisited ? 'DELETE' : 'PUT', `/api/visits/${encodeURIComponent(id)}`);
      if (status !== 200) throw new Error('rejected');
      return true;
    } catch {
      if (wasVisited) this.visited.add(id);
      else this.visited.delete(id);
      this.emit();
      return false;
    }
  }
}
