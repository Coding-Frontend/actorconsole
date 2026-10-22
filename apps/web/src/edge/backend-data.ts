// Public detail renderers receive their data explicitly. Never load Node SDKs,
// sessions, or a database into the Cloudflare bundle.
export async function backendData<T>(): Promise<T> {
  throw new Error("The public renderer requires prefetched API data");
}
