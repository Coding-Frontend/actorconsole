export class RequestBodyTooLarge extends Error {}

/** Bound bytes before the proxy allocates or forwards an untrusted request. */
export async function readProxyBody(request: Request, maxBytes: number): Promise<ArrayBuffer | undefined> {
  if (!request.body) return undefined;
  if (Number(request.headers.get("content-length")) > maxBytes) {
    await request.body.cancel().catch(() => undefined);
    throw new RequestBodyTooLarge();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestBodyTooLarge();
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
