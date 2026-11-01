# Requester addresses and API byte limits

The contact requester quota uses the socket peer provided by `@hono/node-server`, not a caller's `CF-Connecting-IP`, `X-Real-IP` or leftmost `X-Forwarded-For` value. IPv4-mapped IPv6 and equivalent IPv6 spellings are canonicalized before selecting a bucket. The independent per-email quota still applies.

`TRUSTED_PROXY_IPS` accepts only exact comma-separated IPv4/IPv6 addresses, not wildcards or CIDRs. Production startup and the VPS Compose file require a nonempty list. Development can leave it empty. No proxy is implicitly trusted, including loopback and private networks. This setting describes the **peer IP seen by the API socket**, not an external proxy's public DNS name.

When the immediate peer is explicitly trusted, the resolver walks `X-Forwarded-For` from right to left, removing only explicitly trusted hops and stopping at the first untrusted address. A caller-supplied left prefix cannot replace that address. Malformed, missing or excessively long chains fall back to the socket peer. Without socket metadata, requests share one `unknown` bucket; headers never create an identity on their own.

## Before enabling proxy trust in an installation

1. Verify the actual peer addresses through the chosen ingress and container topology using private operational tooling. Do not copy invented container IPs or trust every private address. If proxy/container IPs change, reverify them.
2. Verify that every trusted hop appends or overwrites the forwarding chain with its verified socket peer, and that clients cannot access that hop's trust privilege directly. The repository nginx examples append `$remote_addr` to X-Forwarded-For. The Next.js API bridge preserves that ingress chain; its own socket address must also be a verified trusted peer when it is the API's immediate caller.
3. Configure only those verified peer IPs in the backend environment. Direct requests from other peers continue to ignore all forwarding headers. Do not use CF-Connecting-IP as a shortcut unless a separately verified edge contract is implemented.
4. Verify locally that the same requester still receives 429 after the existing ten-contact-per-hour quota even when spoofable headers vary. Mock delivery; do not send provider emails or load-test the installation.

In production, authentication rejects missing or unusable forwarding identity with 503 instead of sharing a small authentication bucket across every proxied user. Readiness also fails when proxy trust is missing. Authentication uses a 30-request account quota and a larger 300-request source breaker per route and 15-minute window; Firebase exchanges retain a 30-request source quota. The deployment owner must verify the proxy contract and configure exact peers before rolling out the API.

## Contract for the authentication owner

`apps/api/src/lib/client-ip.ts` exports `resolveClientIp(c)`, `verifiedClientIp(c)` and `canonicalAddress(value)`. It reads adapter socket metadata via `getConnInfo(c)` and caches the resolved identity on the request. Authentication, audit logs, policy acceptance and anonymous quotas use this contract. Bare Web Request authentication handlers receive the verified address through server request context. The Next.js bridge preserves the forwarding chain on public reads too, without forwarding browser credentials into public cache entries.
