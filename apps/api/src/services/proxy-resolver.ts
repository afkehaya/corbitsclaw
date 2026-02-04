import { CORBITS_DISCOVERY_API, PROXY_CACHE_TTL_MS } from '@corbitsclaw/shared';

interface CacheEntry {
  url: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export async function resolveProxy(name: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(name);
  if (cached && now - cached.timestamp < PROXY_CACHE_TTL_MS) {
    return cached.url;
  }

  let response: Response;
  try {
    response = await fetch(
      `${CORBITS_DISCOVERY_API}/search?q=${encodeURIComponent(name)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to resolve proxy "${name}": ${message}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to resolve proxy "${name}": Discovery API returned ${response.status}`
    );
  }

  const body = (await response.json()) as {
    proxies?: { url?: string }[];
  };

  const proxyUrl = body.proxies?.[0]?.url;
  if (!proxyUrl) {
    throw new Error(`Unknown Corbits proxy: ${name}`);
  }

  cache.set(name, { url: proxyUrl, timestamp: now });
  return proxyUrl;
}

export function clearProxyCache(): void {
  cache.clear();
}
