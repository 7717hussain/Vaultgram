/**
 * ============================================================================
 * Cloudflare Pages Edge Middleware - Zero-Trust Basic Authentication
 * ============================================================================
 * 
 * Security Guarantees:
 * 1. Global Interception: Placed at `functions/_middleware.js` to guard every static asset,
 *    JSON payload, and script before execution.
 * 2. Constant-Time Hash Comparison: Strings are hashed with SHA-256 before invoking
 *    `crypto.subtle.timingSafeEqual`. This guarantees uniform 32-byte ArrayBuffer lengths,
 *    completely eliminating timing attacks and credential length side-channels.
 * 3. Anti-Brute-Force Tarpitting: Enforces a 1,500ms artificial delay on unauthenticated /
 *    failed requests to choke automated password sprayers and brute-force tools.
 * 4. Resilient Input Sanitization: Catches and cleanly rejects malformed Authorization
 *    headers without leaking 500 runtime exceptions.
 * 5. Defense-in-Depth Headers: Injects strict HSTS, anti-clickjacking, and MIME-sniffing
 *    protection headers on all downstream responses.
 */

const encoder = new TextEncoder();

/**
 * Computes a SHA-256 digest of a string and returns an ArrayBuffer.
 * @param {string} str
 * @returns {Promise<ArrayBuffer>}
 */
async function sha256(str) {
  const data = encoder.encode(str);
  return await crypto.subtle.digest('SHA-256', data);
}

/**
 * Compares two strings in guaranteed constant time using SHA-256 digests.
 * Prevents timing side-channels and length mismatches in `timingSafeEqual`.
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
async function constantTimeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const [digestA, digestB] = await Promise.all([
    sha256(a),
    sha256(b),
  ]);
  return crypto.subtle.timingSafeEqual(digestA, digestB);
}

/**
 * Safely parses the HTTP `Authorization` header for Basic Auth credentials.
 * @param {string|null} header
 * @returns {{ username: string, password: string } | null}
 */
function parseBasicAuth(header) {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') {
    return null;
  }

  try {
    const decoded = atob(parts[1]);
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) {
      return null;
    }
    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);
    return { username, password };
  } catch {
    // Malformed base64
    return null;
  }
}

/**
 * Generates an RFC-compliant 401 Unauthorized Response with no-cache directives.
 * @returns {Response}
 */
function createUnauthorizedResponse() {
  return new Response('401 Unauthorized: Access Denied', {
    status: 401,
    statusText: 'Unauthorized',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Private Streaming Portal", charset="UTF-8"',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}

/**
 * Cloudflare Pages Global Middleware Handler
 * @param {EventContext<any, any, any>} context
 */
export async function onRequest(context) {
  const { request, env, next } = context;

  const expectedUser = env.ADMIN_USERNAME;
  const expectedPass = env.ADMIN_PASSWORD;

  // Fail-Safe: If environment variables are missing, deny all incoming traffic
  if (!expectedUser || !expectedPass) {
    console.error('CRITICAL: ADMIN_USERNAME or ADMIN_PASSWORD environment variable is missing.');
    return new Response('500 Internal Server Error: Authentication Configuration Missing', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const authHeader = request.headers.get('Authorization');
  const credentials = parseBasicAuth(authHeader);

  let isAuthenticated = false;

  if (credentials) {
    const [userMatch, passMatch] = await Promise.all([
      constantTimeStringEqual(credentials.username, expectedUser),
      constantTimeStringEqual(credentials.password, expectedPass),
    ]);

    isAuthenticated = userMatch && passMatch;
  }

  // Tarpit Anti-Brute-Force Delay: 1500ms deterministic wait on failed auth
  if (!isAuthenticated) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return createUnauthorizedResponse();
  }

  // Authentication succeeded: Pass downstream to serve the static asset / route
  const response = await next();

  // Defense-in-Depth: Attach hardened HTTP security headers
  const secureHeaders = new Headers(response.headers);
  secureHeaders.set('X-Content-Type-Options', 'nosniff');
  secureHeaders.set('X-Frame-Options', 'DENY');
  secureHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  secureHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  secureHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: secureHeaders,
  });
}
