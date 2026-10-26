# API byte limits and diagnostics


- The API and Next.js API bridge reject request bodies above 6 MiB before JSON/multipart parsing or forwarding. This accommodates the existing 5 MiB logo input plus multipart overhead. Resend delivery events have a smaller 1 MiB cap at both boundaries.
- Bytes are counted even without Content-Length and rejected streams are cancelled. Signed bodies are preserved byte-for-byte. Other route-specific limits remain in place.
- Remote logo images are limited to 5 MiB; discovery pages/manifests to 1,000,000 bytes. Limits apply during reads and after supported gzip/deflate/Brotli decompression. The downloader pins the native HTTPS lookup to validated public IPs while retaining the original Host/TLS hostname, rejects private/special-use addresses, and validates each redirect/retry. The request deadline also covers DNS and body reads.
- Logo requests use direct HTTPS connections; provider-specific AI proxy configuration is separate and unchanged. No certificate verification exception is introduced.
- HTTP metric labels use registered route patterns, one unmatched bucket and bounded method names. The shared metric serializer is owned by the architecture integrator and is unchanged here.
- Public `/health/ready` failures return `db_unavailable` or `redis_unavailable`, plus readiness/latency. Dependency exception strings are excluded. Use private service logs and local dependency checks for operational diagnosis.

The example nginx API request limit is 2 MiB and the web limit is 10 MiB. These are separate ingress caps; a 5 MiB upload through the API nginx example remains blocked there. Reconcile installation-specific ingress limits separately with the infrastructure owner; this handoff changes no nginx, CI/CD or deployment settings.
