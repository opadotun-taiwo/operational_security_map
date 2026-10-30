import { decodePolylineGeometry, validateCoordinates } from '../utils/routeExposure';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Format duration string or seconds to human-readable format.
 * Google Routes API returns duration as e.g. "3600s" or integer seconds.
 */
export function formatDuration(duration) {
  if (!duration && duration !== 0) return 'Unknown';
  let totalSeconds = 0;

  if (typeof duration === 'string') {
    totalSeconds = parseInt(duration.replace('s', ''), 10);
  } else if (typeof duration === 'number') {
    totalSeconds = Math.round(duration);
  }

  if (isNaN(totalSeconds) || totalSeconds <= 0) return 'Unknown';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)} min`;
}

/**
 * Formats distance in meters to kilometers.
 */
export function formatDistance(meters) {
  if (meters === undefined || meters === null || isNaN(meters)) return 'Unknown';
  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

/**
 * Helper to fetch with an absolute timeout (abort signal).
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Reads a coordinate from either a LatLng (methods) or a LatLngLiteral/LatLngAltitude (properties).
 */
function readLatLng(pt) {
  const lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat;
  const lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng;
  return [lng, lat];
}

/**
 * Computes driving routes in the browser with the Maps JavaScript API Routes library
 * (google.maps.routes.Route), which is backed by the Routes API.
 */
async function computeRoutesClientSide({ origin, destination, computeAlternativeRoutes, timeoutMs }) {
  if (typeof window === 'undefined' || !window.google?.maps?.importLibrary) return null;

  const { Route } = await window.google.maps.importLibrary('routes');
  if (!Route?.computeRoutes) return null;

  const request = Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    computeAlternativeRoutes,
    fields: ['path', 'distanceMeters', 'durationMillis', 'description']
  });
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Route.computeRoutes timed out')), timeoutMs);
  });
  const { routes } = await Promise.race([request, timeout]);
  if (!routes || routes.length === 0) return null;

  return routes.map((r, index) => {
    const durationSeconds = r.durationMillis ? r.durationMillis / 1000 : null;
    return {
      id: `route-${index}`,
      summary: r.description ? `via ${r.description}` : `Route ${index + 1}`,
      distanceMeters: r.distanceMeters,
      distanceText: formatDistance(r.distanceMeters),
      durationText: formatDuration(durationSeconds),
      durationSeconds,
      coordinates: (r.path || []).map(readLatLng),
      rawRoute: r
    };
  }).filter(r => r.coordinates.length >= 2);
}

/**
 * Calculates routes using a resilient multi-tier architecture:
 * 1. Google Routes API via the Maps JavaScript API (client-side)
 * 2. Supabase Edge Function (Google Routes API v2, server-side key)
 * 3. Driving Road Network Engine (OSRM Road Network)
 * 4. Straight-line corridor estimate (offline fail-safe, flagged as an estimate)
 *
 * @param {Object} params
 * @param {{ lat: number, lng: number } | string} params.origin
 * @param {{ lat: number, lng: number } | string} params.destination
 * @param {boolean} [params.computeAlternativeRoutes=true]
 * @returns {Promise<{ routes: Array<Object>, source: string, isEstimate?: boolean }>}
 */
export async function calculateRoute({
  origin,
  destination,
  computeAlternativeRoutes = true
}) {
  // Validate coordinates
  const origLat = typeof origin === 'object' ? parseFloat(origin.lat) : NaN;
  const origLng = typeof origin === 'object' ? parseFloat(origin.lng) : NaN;
  const destLat = typeof destination === 'object' ? parseFloat(destination.lat) : NaN;
  const destLng = typeof destination === 'object' ? parseFloat(destination.lng) : NaN;

  if (typeof origin === 'object') {
    const originCheck = validateCoordinates(origin, false);
    if (!originCheck.valid) {
      throw new Error(`Origin error: ${originCheck.error}`);
    }
  }

  if (typeof destination === 'object') {
    const destCheck = validateCoordinates(destination, false);
    if (!destCheck.valid) {
      throw new Error(`Destination error: ${destCheck.error}`);
    }
  }

  // --------------------------------------------------------------------------
  // ATTEMPT 1: Google Routes API through the Maps JavaScript API (Client-side)
  // --------------------------------------------------------------------------
  try {
    const clientRoutes = await computeRoutesClientSide({
      origin,
      destination,
      computeAlternativeRoutes,
      timeoutMs: 8000
    });
    if (clientRoutes && clientRoutes.length > 0) {
      return { routes: clientRoutes, source: 'Google Routes API' };
    }
  } catch (clientErr) {
    console.warn('Client-side Google routing unavailable, trying next provider:', clientErr.message);
  }

  // --------------------------------------------------------------------------
  // ATTEMPT 2: Supabase Edge Function (Google Routes API, server-side key)
  // --------------------------------------------------------------------------
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/calculate-route`;
      const response = await fetchWithTimeout(
        edgeFunctionUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            origin,
            destination,
            computeAlternativeRoutes
          })
        },
        6000
      );

      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const parsedRoutes = data.routes.map((r, index) => {
            const encoded = r.polyline?.encodedPolyline || '';
            const coordinates = decodePolylineGeometry(encoded);
            return {
              id: `route-${index}`,
              summary: r.description ? `via ${r.description}` : `Route ${index + 1}`,
              distanceMeters: r.distanceMeters,
              distanceText: formatDistance(r.distanceMeters),
              durationText: formatDuration(r.duration),
              durationSeconds: parseInt(String(r.duration || '').replace('s', ''), 10) || null,
              coordinates,
              rawRoute: r
            };
          });

          return { routes: parsedRoutes, source: 'Google Routes API (Server)' };
        }
      }
    } catch (edgeErr) {
      console.warn('Route edge function unavailable, trying next provider:', edgeErr.message);
    }
  }

  // --------------------------------------------------------------------------
  // ATTEMPT 3: Driving Road Network Router (Real Highway Geometry)
  // --------------------------------------------------------------------------
  if (!isNaN(origLat) && !isNaN(origLng) && !isNaN(destLat) && !isNaN(destLng)) {
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=${computeAlternativeRoutes}`;
      const osrmRes = await fetchWithTimeout(osrmUrl, {}, 8000);

      if (osrmRes.ok) {
        const data = await osrmRes.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const parsedRoutes = data.routes.map((r, index) => {
            const coordinates = r.geometry?.coordinates || [];
            const summary = r.legs?.[0]?.summary 
              ? `via ${r.legs[0].summary}` 
              : `Driving Corridor ${index + 1}`;

            return {
              id: `road-route-${index}`,
              summary,
              distanceMeters: Math.round(r.distance),
              distanceText: formatDistance(r.distance),
              durationText: formatDuration(r.duration),
              durationSeconds: r.duration,
              coordinates,
              rawRoute: r
            };
          });

          return { routes: parsedRoutes, source: 'Road Network Navigation' };
        }
      }
    } catch (osrmErr) {
      console.warn('Road network router unavailable, using straight-line estimate:', osrmErr.message);
    }
  }

  // --------------------------------------------------------------------------
  // ATTEMPT 4: Straight-line Corridor Estimate (Offline Fail-safe)
  // --------------------------------------------------------------------------
  if (!isNaN(origLat) && !isNaN(origLng) && !isNaN(destLat) && !isNaN(destLng)) {
    // Generate 20 intermediate points along great-circle line for corridor calculations
    const segments = 20;
    const coordinates = [];
    for (let i = 0; i <= segments; i++) {
      const fraction = i / segments;
      const lat = origLat + (destLat - origLat) * fraction;
      const lng = origLng + (destLng - origLng) * fraction;
      coordinates.push([lng, lat]);
    }

    // Estimate straight-line distance in meters
    const rad = Math.PI / 180;
    const dLat = (destLat - origLat) * rad;
    const dLng = (destLng - origLng) * rad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origLat * rad) * Math.cos(destLat * rad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distMeters = Math.round(6371000 * c * 1.25); // ~25% road winding factor
    const estSeconds = Math.round(distMeters / 16.6); // ~60 km/h average speed

    const failSafeRoute = {
      id: 'geodesic-corridor-0',
      summary: 'Straight-line estimate (no road data)',
      distanceMeters: distMeters,
      distanceText: formatDistance(distMeters),
      durationText: formatDuration(estSeconds),
      durationSeconds: estSeconds,
      coordinates,
      rawRoute: null
    };

    return {
      routes: [failSafeRoute],
      source: 'Straight-line Estimate',
      isEstimate: true
    };
  }

  throw new Error('Unable to compute route: Coordinates are invalid or missing.');
}
