"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionStore = void 0;
/**
 * In-memory session store.
 * Key: sessionId (UUID string)
 * Value: SessionState
 *
 * For production: replace with Redis or a DB-backed store.
 * The interface (get/set/delete/has) is kept simple for easy swap-out.
 */
class SessionStore {
    store = new Map();
    get(sessionId) {
        return this.store.get(sessionId);
    }
    set(sessionId, session) {
        this.store.set(sessionId, session);
    }
    delete(sessionId) {
        this.store.delete(sessionId);
    }
    has(sessionId) {
        return this.store.has(sessionId);
    }
    size() {
        return this.store.size;
    }
}
// Singleton — shared across the entire process lifetime
exports.sessionStore = new SessionStore();
