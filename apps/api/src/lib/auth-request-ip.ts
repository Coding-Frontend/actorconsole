/** Server-only metadata from resolveClientIp; bare Requests never trust IP headers. */
const verifiedAddresses = new WeakMap<Request, string>();

export function setAuthRequestIp(request: Request, address: string): void {
  verifiedAddresses.set(request, address);
}

export function getAuthRequestIp(request: Request): string | null {
  const address = verifiedAddresses.get(request);
  return address && address !== "unknown" ? address : null;
}
