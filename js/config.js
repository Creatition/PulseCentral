/**
 * PulseCentral – js/config.js
 * Centralised frontend configuration.
 *
 * When the page is served by the Express backend (production / dev server),
 * all API calls go through the local proxy at the same origin so there are
 * no CORS issues and responses benefit from server-side caching.
 *
 * When the page is opened directly as a file (file:// protocol) or hosted on
 * a CDN without the backend, the flag below can be set to false and
 * DIRECT_SCAN_BASE / DIRECT_DSX_BASE will be used instead.
 */

const PulseCentralConfig = (() => {
  /**
   * Set to true when the page is served by the PulseCentral Express server.
   * Change to false to use direct upstream URLs (bypasses proxy / caching).
   */
  const USE_BACKEND = true;

  /** Base URL of the Express API (empty string = same origin). */
  const API_BASE = '';

  return {
    USE_BACKEND,
    API_BASE,
  };
})();
