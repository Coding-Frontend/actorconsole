/** Public build settings shared by Node release scripts and the Pages Worker. */
function origin(value, name) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials or a path`);
  }
  return url.origin;
}

export const PUBLIC_SITE = origin(
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:8080',
  'NEXT_PUBLIC_SITE_URL',
);
export const PUBLIC_API_ORIGIN = origin(
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000',
  'NEXT_PUBLIC_API_BASE_URL',
);
