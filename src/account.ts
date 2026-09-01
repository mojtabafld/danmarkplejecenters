/**
 * Accounts and the visited list, client side.
 *
 * The whole feature is optional. If the server has no database bound it
 * answers 503, and everything here reports itself unavailable so the interface
 * can leave the account button out rather than offer something that cannot
 * work. The map, the search and the cards never depend on any of it.
 */

export type AccountUser = {
  email: string;
  /**
   * True when this address is listed in ADMIN_EMAILS on the server.
   *
   * The server answers this, and it is only ever used to decide whether to
   * offer the link: the panel itself is guarded server-side, so a browser that
   * lies about this reaches a page that refuses it.
   */
  admin?: boolean;
};

export type AuthError =
  | 'no_database'
  | 'not_verified'
  | 'mail_unavailable'
  | 'mail_failed'
  | 'bad_email'
  | 'too_short'
  | 'too_long'
  | 'email_taken'
  | 'bad_credentials'
  | 'bad_token'
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
  /** Free text the reader has written, by plejecenter id. */
  notes = new Map<string, string>();
  /** False when the server has no database, so the feature is hidden entirely. */
  available = true;
  /** Set after sign-up: the address waiting on a confirmation link. */
  pendingEmail: string | null = null;
  /** The address sign-in refused because it is not confirmed yet. */
  unverifiedEmail: string | null = null;
  /** Set once a reset link has been asked for: the panel says so and stops. */
  resetSentTo: string | null = null;
  /**
   * A reset token from the link in the mail, if this page was opened by one.
   * Its presence is what puts the panel into "choose a new password".
   */
  resetToken: string | null = null;

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
      // Read the code from the body, not the status. The platform rewrites an
      // upstream 5xx into its own HTML page, so a status alone cannot be
      // trusted to distinguish "accounts are not set up" from "it is broken".
      if (data.error === 'no_database' || status === 503) {
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
      const [visits, notes] = await Promise.all([
        call('GET', '/api/visits'),
        call('GET', '/api/notes'),
      ]);
      this.visited = visits.status === 200 ? new Set(visits.data.visits as string[]) : new Set();
      this.notes =
        notes.status === 200
          ? new Map(Object.entries((notes.data.notes ?? {}) as Record<string, string>))
          : new Map();
    } catch {
      this.visited = new Set();
      this.notes = new Map();
    }
  }

  noteFor(id: string): string {
    return this.notes.get(id) ?? '';
  }

  /**
   * Write or clear a note. Empty text removes it, so clearing the box is how
   * you delete one and there is no second control to explain.
   */
  async saveNote(id: string, body: string): Promise<boolean> {
    if (!this.user) return false;
    const text = body.trim();
    try {
      const { status, data } = await call('PUT', `/api/notes/${encodeURIComponent(id)}`, { body: text });
      if (status !== 200) return false;
      if (data.note) this.notes.set(id, data.note as string);
      else this.notes.delete(id);
      this.emit();
      return true;
    } catch {
      return false;
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
      this.pendingEmail = null;
      this.unverifiedEmail = null;
      await this.loadVisits();
      this.emit();
      return null;
    }
    const error = (data.error as AuthError) ?? 'server_error';
    if (error === 'not_verified') {
      this.unverifiedEmail = (data.email as string) ?? email;
      this.emit();
    }
    return error;
  }

  signIn(email: string, password: string): Promise<AuthError | null> {
    return this.credentials('/api/auth/signin', email, password);
  }

  /**
   * Sign-up does not sign you in. It creates an unconfirmed account and posts a
   * link; `pendingEmail` is what the panel then shows instead of the form.
   */
  async signUp(email: string, password: string): Promise<AuthError | null> {
    let status: number;
    let data: Record<string, unknown>;
    try {
      ({ status, data } = await call('POST', '/api/auth/signup', { email, password }));
    } catch {
      return 'offline';
    }
    if (status === 201) {
      this.pendingEmail = (data.email as string) ?? email;
      this.emit();
      return null;
    }
    return (data.error as AuthError) ?? 'server_error';
  }

  /** Ask for the confirmation link again. Always resolves; never reveals much. */
  async resend(email: string): Promise<boolean> {
    try {
      const { status } = await call('POST', '/api/auth/resend', { email });
      return status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Ask for a reset link.
   *
   * Reports success whatever the server found, because the server answers the
   * same way whether or not the address has an account -- saying more here
   * would put back the account-enumeration the endpoint is careful to avoid.
   */
  async forgot(email: string): Promise<AuthError | null> {
    let status: number;
    let data: Record<string, unknown>;
    try {
      ({ status, data } = await call('POST', '/api/auth/forgot', { email }));
    } catch {
      return 'offline';
    }
    if (status === 200) {
      this.resetSentTo = email;
      this.emit();
      return null;
    }
    return (data.error as AuthError) ?? 'failed';
  }

  /** Set a new password from the link. Ends every session, so it signs out. */
  async resetPassword(password: string): Promise<AuthError | null> {
    const token = this.resetToken;
    if (!token) return 'bad_token';
    let status: number;
    let data: Record<string, unknown>;
    try {
      ({ status, data } = await call('POST', '/api/auth/reset', { token, password }));
    } catch {
      return 'offline';
    }
    if (status === 200) {
      // The token is spent and every session with it, so whoever was signed in
      // here is not any more.
      this.resetToken = null;
      this.user = null;
      this.visited.clear();
      this.notes.clear();
      this.emit();
      return null;
    }
    // A spent token cannot be retried, so the form goes away with it.
    if (data.spent === true || data.error === 'bad_token') this.resetToken = null;
    this.emit();
    return (data.error as AuthError) ?? 'failed';
  }

  clearReset(): void {
    this.resetSentTo = null;
    this.resetToken = null;
    this.emit();
  }

  clearPending(): void {
    this.pendingEmail = null;
    this.emit();
  }

  async signOut(): Promise<void> {
    try {
      await call('POST', '/api/auth/signout');
    } catch {
      /* clear locally regardless: the cookie expires on its own */
    }
    this.user = null;
    this.visited = new Set();
    this.notes = new Map();
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
    this.notes = new Map();
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
