const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    if (isJson) {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    }
    throw new ApiError(message, response.status);
  }
  if (!isJson) {
    throw new ApiError("The server did not return JSON.", response.status);
  }
  return response.json() as Promise<T>;
}
