export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = "HttpError";
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.options.baseUrl}${path}`;
    const attempts = (this.options.retries ?? 2) + 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: { "content-type": "application/json", ...this.options.headers },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
        });
        if (response.status >= 500 && attempt < attempts) continue;
        if (!response.ok) throw new HttpError(response.status, url, await response.text());
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof HttpError) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
}
