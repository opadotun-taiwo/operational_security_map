// Supabase Edge Function: calculate-route
// Handles secure server-side Google Routes API calls without exposing secret keys to browser clients.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { origin, destination, computeAlternativeRoutes = true } = body;

    if (!origin || !destination) {
      return new Response(JSON.stringify({ error: 'Both origin and destination are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Resolve server API key
    const serverKey = Deno.env.get('GOOGLE_MAPS_SERVER_KEY') || Deno.env.get('VITE_GOOGLE_MAPS_API_KEY');

    if (!serverKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Google Maps Server Key not configured on backend. Please configure GOOGLE_MAPS_SERVER_KEY.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format origin and destination for Google Routes API
    const formatLocation = (loc: any) => {
      if (typeof loc === 'object' && loc.lat !== undefined && loc.lng !== undefined) {
        return {
          location: {
            latLng: {
              latitude: parseFloat(loc.lat),
              longitude: parseFloat(loc.lng)
            }
          }
        };
      }
      if (typeof loc === 'string') {
        return { address: loc };
      }
      return loc;
    };

    const routesPayload = {
      origin: formatLocation(origin),
      destination: formatLocation(destination),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      computeAlternativeRoutes: Boolean(computeAlternativeRoutes),
      polylineQuality: 'HIGH_QUALITY',
      polylineEncoding: 'ENCODED_POLYLINE'
    };

    const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': serverKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description,routes.warnings'
      },
      body: JSON.stringify(routesPayload)
    });

    const data = await googleResponse.json();

    if (!googleResponse.ok) {
      console.error('Google Routes API Error:', data);
      return new Response(
        JSON.stringify({ 
          error: data.error?.message || 'Routes calculation failed from Google Routes API',
          status: googleResponse.status,
          details: data.error
        }),
        { 
          status: googleResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Unexpected error in calculate-route edge function:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
