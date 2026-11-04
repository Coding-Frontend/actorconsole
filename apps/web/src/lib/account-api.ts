import { API_BASE_URL } from "./api-base";

export class AccountApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export async function accountRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/account${path}`, {
      credentials: "include",
      cache: "no-store",
      ...init,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new AccountApiError("Could not reach ActorConsole. Check your connection and try again.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true || result.data === undefined) {
    const message = result?.error?.message;
    throw new AccountApiError(
      typeof message === "string" && !message.startsWith("[")
        ? message
        : "This request could not be completed. Please try again.",
      result?.error?.code,
    );
  }
  return result.data as T;
}

export function accountMutation<T>(path: string, data?: unknown, method = "POST") {
  return accountRequest<T>(path, {
    method,
    ...(data === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }),
  });
}
