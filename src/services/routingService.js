import { decodePolylineGeometry, validateCoordinates } from '../utils/routeExposure';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Format duration string or seconds to human-readable format.
 * Google Routes API returns duration as e.g. "3600s" or integer seconds.
 */
export function formatDuration(duration) {
  if (!duration) return 'Unknown';
  let totalSeconds = 0;

  if (typeof duration === 'string') {
    totalSeconds = parseInt(duration.replace('s', ''), 10);
  } else if (typeof duration === 'number') {
    totalSeconds = duration;
  }

  if (isNaN(totalSeconds) || totalSeconds <= 0) return 'Unknown';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
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
 * Calculates routes using the secure Supabase Edge Function (Google Routes API),
 * with automatic fallback to client-side Google Maps DirectionsService.
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
  // Validate coordinates if provided as objects
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

  // Attempt 1: Secure Supabase Edge Function (Google Routes API)
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/calculate-route`;
      const response = await fetch(edgeFunctionUrl, {
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
      });

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

          return { routes: parsedRoutes, source: 'supabase-edge-routes-api' };
        }
      } else {
        console.warn('Edge function returned non-200 status, attempting Google Maps client fallback...');
      }
    } catch (edgeErr) {
      console.warn('Edge function request failed, falling back to client-side DirectionsService:', edgeErr);
    }
  }

  // Attempt 2: Fallback to Google Maps JavaScript DirectionsService (Client-side)
  if (window.google?.maps?.DirectionsService) {
    return new Promise((resolve, reject) => {
      const directionsService = new window.google.maps.DirectionsService();

      const formatDirectionsPoint = (pt) => {
        if (typeof pt === 'object' && pt.lat !== undefined && pt.lng !== undefined) {
          return new window.google.maps.LatLng(pt.lat, pt.lng);
        }
        return pt;
      };

      directionsService.route(
        {
          origin: formatDirectionsPoint(origin),
          destination: formatDirectionsPoint(destination),
          travelMode: window.google.maps.TravelMode.DRIVE,
          provideRouteAlternatives: computeAlternativeRoutes
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK && result.routes?.length > 0) {
            const parsedRoutes = result.routes.map((r, index) => {
              // Extract all path points from legs
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
                summary: r.summary || `Route ${index + 1}`,
                distanceMeters: totalDistanceMeters,
                distanceText: formatDistance(totalDistanceMeters),
                durationText: formatDuration(totalDurationSeconds),
                coordinates,
                rawRoute: r
              };
            });

            resolve({ routes: parsedRoutes, source: 'google-maps-directions-client' });
          } else {
            reject(new Error(`Directions request failed with status: ${status}`));
          }
        }
      );
    });
  }

  throw new Error(
    'Unable to compute route: neither the Supabase Edge Function nor Google Maps DirectionsService was available. Check your internet connection and API keys.'
  );
}

