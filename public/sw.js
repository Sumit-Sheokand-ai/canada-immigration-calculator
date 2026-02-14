// Service Worker for injecting security headers
// Since GitHub Pages doesn't support custom HTTP headers via _headers file

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://plausible.io https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;"
};

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  // Claim all clients immediately
  event.waitUntil(clients.claim());
});

// Fetch event - intercept all requests and add security headers
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response since it's immutable
        const newHeaders = new Headers(response.headers);
        
        // Add security headers to HTML documents
        if (response.headers.get('content-type')?.includes('text/html')) {
          Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
            newHeaders.set(key, value);
          });
          
          // Create new response with added headers
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          });
        }
        
        // For non-HTML resources, return as-is
        return response;
      })
      .catch((error) => {
        console.error('[SW] Fetch error:', error);
        return new Response('Network error', { status: 408 });
      })
  );
});
