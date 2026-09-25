/**
 * Fail fast when packaging without a production API origin.
 * Usage (from repo root): node desktop/scripts/require-vite-api-url.js
 *
 * Exit 0 when VITE_API_URL is a non-empty https:// origin (trailing slash stripped for checks).
 * Prints nothing on success so this is safe in npm scripts on Windows and Unix.
 */
const raw = process.env.VITE_API_URL;
const url = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';

if (!url) {
  console.error(
    'Set VITE_API_URL to your production API origin (e.g. https://jobs.yourdomain.com), no trailing slash.',
  );
  process.exit(1);
}

if (!/^https:\/\//i.test(url)) {
  console.error(
    `VITE_API_URL must be an https:// origin (got: ${JSON.stringify(raw)}).`,
  );
  process.exit(1);
}
