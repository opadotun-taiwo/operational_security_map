import { decodePolylineGeometry, validateCoordinates } from '../utils/routeExposure';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

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
 * Calculates routes using a resilient multi-tier architecture:
 * 1. Supabase Edge Function (Google Routes API v2)
 * 2. Google Maps JavaScript API DirectionsService (Client-side)
 * 3. High-Precision Driving Road Network Engine (OSRM Road Network)
 * 4. Geodesic Highway Corridor (Offline Fail-safe)
 *
 * @param {Object} params
 * @param {{ lat: number, lng: number } | string} params.origin
 * @param {{ lat: number, lng: number } | string} params.destination
 * @param {boolean} [params.computeAlternativeRoutes=true]
 * @returns {Promise<{ routes: Array<Object>, source: string }>}
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
  // ATTEMPT 1: Supabase Edge Function (Google Routes API)
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
            apiKey: GOOGLE_MAPS_API_KEY,
            computeAlternativeRoutes
          })
        },
        4000
      );

      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const parsedRoutes = data.routes.map((r, index) => {
            const encoded = r.polyline?.encodedPolyline || '';
            const coordinates = decodePolylineGeometry(encoded);
            return {
              id: `route-${index}`,
              summary: r.description || `Route ${index + 1}`,
              distanceMeters: r.distanceMeters,
              distanceText: formatDistance(r.distanceMeters),
              durationText: formatDuration(r.duration),
              coordinates,
              rawRoute: r
            };
          });

          return { routes: parsedRoutes, source: 'Google Routes API' };
        }
      }
    } catch (_edgeErr) {
      // Proceed gracefully to next tier
    }
  }

  // --------------------------------------------------------------------------
  // ATTEMPT 2: Google Maps JavaScript DirectionsService (Client-side)
  // --------------------------------------------------------------------------
  if (typeof window !== 'undefined' && window.google?.maps?.DirectionsService) {
    try {
      const clientRoute = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('DirectionsService timed out'));
        }, 4000);

        try {
          const directionsService = new window.google.maps.DirectionsService();

          const formatPoint = (pt) => {
            if (typeof pt === 'object' && pt.lat !== undefined && pt.lng !== undefined) {
              return new window.google.maps.LatLng(pt.lat, pt.lng);
            }
            return pt;
          };

          const travelMode = window.google.maps.TravelMode?.DRIVING || 'DRIVING';

          directionsService.route(
            {
              origin: formatPoint(origin),
              destination: formatPoint(destination),
              travelMode,
              provideRouteAlternatives: computeAlternativeRoutes
            },
            (result, status) => {
              clearTimeout(timer);
              if (status === 'OK' && result?.routes?.length > 0) {
                const parsedRoutes = result.routes.map((r, index) => {
                  const coordinates = [];
                  let totalDistanceMeters = 0;
                  let totalDurationSeconds = 0;

                  for (const leg of r.legs) {
                    totalDistanceMeters += leg.distance?.value || 0;
                    totalDurationSeconds += leg.duration?.value || 0;
                    for (const step of leg.steps) {
                      for (const pt of step.path) {
                        coordinates.push([pt.lng(), pt.lat()]);
                      }
                    }
                  }

                  return {
                    id: `route-${index}`,
                    summary: r.summary || `Driving Route ${index + 1}`,
                    distanceMeters: totalDistanceMeters,
                    distanceText: formatDistance(totalDistanceMeters),
                    durationText: formatDuration(totalDurationSeconds),
                    coordinates,
                    rawRoute: r
                  };
                });

                resolve({ routes: parsedRoutes, source: 'Google Directions Service' });
              } else {
                reject(new Error(`Directions status: ${status}`));
              }
            }
          );
        } catch (callErr) {
          clearTimeout(timer);
          reject(callErr);
        }
      });

      if (clientRoute?.routes?.length > 0) {
        return clientRoute;
      }
    } catch (_clientErr) {
      // Proceed gracefully to next tier
    }
  }

  // --------------------------------------------------------------------------
  // ATTEMPT 3: Driving Road Network Router (Real Highway Geometry)
  // --------------------------------------------------------------------------
  if (!isNaN(origLat) && !isNaN(origLng) && !isNaN(destLat) && !isNaN(destLng)) {
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=${computeAlternativeRoutes}`;
      const osrmRes = await fetchWithTimeout(osrmUrl, {}, 5000);

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
              coordinates,
              rawRoute: r
            };
          });

          return { routes: parsedRoutes, source: 'Road Network Navigation' };
        }
      }
    } catch (_osrmErr) {
      // Proceed to fail-safe corridor
    }
  }

  // --------------------------------------------------------------------------
  // ATTEMPT 4: Multi-segment Geodesic Corridor Route (Offline Fail-safe)
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
      summary: 'Direct Operational Corridor',
      distanceMeters: distMeters,
      distanceText: formatDistance(distMeters),
      durationText: formatDuration(estSeconds),
      coordinates,
      rawRoute: null
    };

    return {
      routes: [failSafeRoute],
      source: 'Direct Operational Corridor'
    };
  }

  throw new Error('Unable to compute route: Coordinates are invalid or missing.');
}
