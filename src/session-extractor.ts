import type { BrowserInstance, SerializedCookie, CookiePayload, StoragePayload } from './types.js';

/**
 * Extract cookies from the active browser context via CDP.
 * Uses `Network.getAllCookies` — no private Puppeteer API required.
 */
export async function extractCookies(instance: BrowserInstance): Promise<CookiePayload> {
  const { cdpSession, id: browserId } = instance;

  if (!cdpSession) {
    throw new Error(`No CDP session for browser ${browserId}`);
  }

  let result: { cookies: SerializedCookie[] };
  try {
    const raw = await cdpSession.send('Network.getAllCookies');
    // CDP returns cookies with expires as float (unix seconds, -1 = session)
    result = {
      cookies: (raw as { cookies: RawCdpCookie[] }).cookies.map(normalizeCookie),
    };
  } catch (err) {
    throw new Error(`Cookie extraction failed: ${(err as Error).message}`);
  }

  return { browserId, cookies: result.cookies };
}

/**
 * Extract localStorage and sessionStorage from all frames in the active page.
 * Runs JS inside the page — works on any origin currently loaded.
 */
export async function extractStorage(instance: BrowserInstance): Promise<StoragePayload> {
  const { page, id: browserId } = instance;

  const [localStorageData, sessionStorageData] = await Promise.all([
    page.evaluate(() => {
      const result: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) result[key] = localStorage.getItem(key) ?? '';
      }
      return result;
    }),
    page.evaluate(() => {
      const result: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key !== null) result[key] = sessionStorage.getItem(key) ?? '';
      }
      return result;
    }),
  ]);

  return {
    browserId,
    localStorage: localStorageData,
    sessionStorage: sessionStorageData,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface RawCdpCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

function normalizeCookie(c: RawCdpCookie): SerializedCookie {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: normalizeSameSite(c.sameSite),
  };
}

function normalizeSameSite(
  raw: string | undefined,
): 'Strict' | 'Lax' | 'None' | 'no_restriction' {
  switch (raw) {
    case 'Strict':
      return 'Strict';
    case 'Lax':
      return 'Lax';
    case 'None':
      return 'None';
    default:
      return 'no_restriction';
  }
}
