import { AwsClient } from "aws4fetch";
import { readLimitedResponse } from "./safe-fetch";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

class WebsiteLogoR2Storage {
  constructor(
    readonly bucket: string,
    private readonly endpoint: string,
    private readonly client: AwsClient,
  ) {}

  private request(key: string, init: RequestInit) {
    return this.client.fetch(`${this.endpoint}/${this.bucket}/${key}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  }

  async read(key: string): Promise<Buffer | null> {
    const response = await this.request(key, { method: "GET" });
    if (response.status === 404) {
      const error = await readLimitedResponse(response, 8_192, "Invalid R2 error response");
      if (error.includes("<Code>NoSuchKey</Code>")) return null;
    }
    if (!response.ok) {
      if (!response.bodyUsed) await response.body?.cancel();
      throw new Error(`R2 logo download failed (HTTP ${response.status})`);
    }
    const bytes = await readLimitedResponse(
      response,
      MAX_LOGO_BYTES,
      "R2 logo exceeded the size limit",
    );
    if (!bytes.length) throw new Error("R2 returned an empty logo");
    return bytes;
  }

  async put(key: string, bytes: Buffer, contentType = "image/webp") {
    const response = await this.request(key, {
      method: "PUT",
      headers: { "content-type": contentType, "if-none-match": "*" },
      body: new Uint8Array(bytes),
    });
    await response.body?.cancel();
    // The key includes a hash of the bytes, so a retry may find it already stored.
    if (!response.ok && response.status !== 412) {
      throw new Error(`R2 logo upload failed (HTTP ${response.status})`);
    }
  }

  async remove(key: string) {
    const response = await this.request(key, { method: "DELETE" });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`R2 probe cleanup failed (HTTP ${response.status})`);
  }
}

let storage: WebsiteLogoR2Storage | undefined;

export function requireWebsiteLogoR2() {
  if (storage) return storage;

  const accountId = process.env.WEBSITE_LOGO_R2_ACCOUNT_ID?.trim();
  const bucket = process.env.WEBSITE_LOGO_R2_BUCKET?.trim();
  const accessKeyId = process.env.WEBSITE_LOGO_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.WEBSITE_LOGO_R2_SECRET_ACCESS_KEY?.trim();
  if (
    !accountId ||
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !bucket ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    throw new Error("R2 logo storage requires a valid account ID, bucket, access key, and secret");
  }

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
    retries: 2,
  });
  storage = new WebsiteLogoR2Storage(
    bucket,
    `https://${accountId}.r2.cloudflarestorage.com`,
    client,
  );
  return storage;
}
