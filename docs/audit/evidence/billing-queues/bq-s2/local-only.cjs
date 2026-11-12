const net = require('node:net');
const tls = require('node:tls');
const local = (host) => !host || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host));
for (const [mod, method] of [[net, 'connect'], [net, 'createConnection'], [tls, 'connect']]) {
  const original = mod[method];
  mod[method] = function(...args) {
    const first = args[0];
    const host = first && typeof first === 'object' ? first.host || first.hostname : typeof args[1] === 'string' ? args[1] : undefined;
    if (!local(host)) throw new Error('Audit fixture blocked outbound network connection');
    return original.apply(this, args);
  };
}
if (globalThis.fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = function(input, init) {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!local(target.hostname)) return Promise.reject(new Error('Audit fixture blocked outbound fetch'));
    return original.call(this, input, init);
  };
}
