export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export function handleCorsPreflightRequest(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    ...(init.headers || {}),
  };
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}
