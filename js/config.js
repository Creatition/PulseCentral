/**
 * PulseCentral – js/config.js
 * Centralised frontend configuration.
 *
 * When the page is served by the Express backend (production / dev server),
 * all API calls go through the local proxy at the same origin so there are
 * no CORS issues and responses benefit from server-side caching.
 *
 * When the page is opened directly as a file (file:// protocol) or hosted on
 * a CDN without the backend, set USE_BACKEND to false — direct upstream URLs
 * will be used instead.
 *
 * To switch modes:
 *   USE_BACKEND = true   → requests go through /api/proxy/* (requires the Express server)
 *   USE_BACKEND = false  → requests go directly to upstream APIs (CORS permitting)
 */

const PulseCentralConfig = (() => {
  /**
   * Set to true when the page is served by the PulseCentral Express server.
   * Set to false when opening index.html directly via file:// or a static host.
   */
  const USE_BACKEND = true;

  /** Base URL of the Express API (empty string = same origin as the page). */
  const API_BASE = '';

  return {
    USE_BACKEND,
    API_BASE,
  };
})();
