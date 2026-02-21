import type { SessionState } from "../types";

/**
 * In-memory session store.
 * Key: sessionId (UUID string)
 * Value: SessionState
 *
 * For production: replace with Redis or a DB-backed store.
 * The interface (get/set/delete/has) is kept simple for easy swap-out.
 */
class SessionStore {
  private store: Map<string, SessionState> = new Map();

  get(sessionId: string): SessionState | undefined {
    return this.store.get(sessionId);
  }

  set(sessionId: string, session: SessionState): void {
    this.store.set(sessionId, session);
  }

  delete(sessionId: string): void {
    this.store.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.store.has(sessionId);
  }

  size(): number {
    return this.store.size;
  }
}

// Singleton — shared across the entire process lifetime
export const sessionStore = new SessionStore();
