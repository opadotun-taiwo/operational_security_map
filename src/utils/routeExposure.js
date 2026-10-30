import * as turf from '@turf/turf';

/**
 * Robust Google encoded polyline decoder with zero external package dependencies.
 * Decodes standard Google encoded polyline strings to GeoJSON [lng, lat] coordinate pairs.
 * 
 * @param {string} encoded - Encoded polyline string
 * @returns {Array<[number, number]>} Array of [lng, lat] coordinate pairs
 */
export function decodePolylineGeometry(encoded) {
  if (!encoded || typeof encoded !== 'string') {
    return [];
  }

  try {
    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      // GeoJSON standard coordinate order: [longitude, latitude]
      poly.push([lng * 1e-5, lat * 1e-5]);
    }

    return poly;
  } catch (err) {
    console.error('Failed to decode polyline:', err);
    return [];
  }
}

/**
 * Validates geographical coordinates, especially within operational boundaries (Nigeria / West Africa).
 * Nigeria bounding box roughly: Lat 3.5 - 14.5 N, Lng 2.0 - 15.5 E.
 * 
 * @param {Object} coords - { lat: number, lng: number }
 * @param {boolean} enforceNigeriaBounds - Whether to check if coordinates are within Nigeria bounds
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateCoordinates(coords, enforceNigeriaBounds = true) {
  if (!coords || typeof coords !== 'object') {
    return { valid: false, error: 'Invalid coordinate object provided' };
  }

  const lat = parseFloat(coords.lat);
  const lng = parseFloat(coords.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return { valid: false, error: 'Latitude and Longitude must be valid numerical values' };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, error: 'Coordinates are out of global WGS84 range' };
  }

  if (enforceNigeriaBounds) {
    const isWithinNigeria = lat >= 3.5 && lat <= 14.5 && lng >= 2.0 && lng <= 15.5;
    if (!isWithinNigeria) {
      return { 
        valid: false, 
        error: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)}) is outside the Nigerian operational theater (Lat 3.5-14.5, Lng 2.0-15.5)` 
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Calculates security exposure along a route geometry for a given set of incidents.
 *
 * @param {Object} options
 * @param {Array<[number, number]>} options.routeCoordinates - Array of [lng, lat] points
 * @param {Array<Object>} options.incidents - Security incident records
 * @param {number} [options.corridorDistanceKm=5] - Proximity corridor width in kilometers
 * @returns {Object} Comprehensive exposure evaluation
 */
export function calculateRouteExposure({
  routeCoordinates,
  incidents = [],
  corridorDistanceKm = 5
}) {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return {
      corridorIncidents: [],
      totalCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumLowCount: 0,
      fatalities: 0,
      injured: 0,
      abducted: 0,
      verifiedCount: 0,
      recentCount: 0,
      riskScore: 0,
      riskLevel: 'UNKNOWN',
      corridorDistanceKm,
      disclaimer: 'Route geometry unavailable for security analysis.'
    };
  }

  // Build Turf LineString
  const routeLine = turf.lineString(routeCoordinates);
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  const corridorIncidents = [];
  let totalFatalities = 0;
  let totalInjured = 0;
  let totalAbducted = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumLowCount = 0;
  let verifiedCount = 0;
  let recentCount = 0;

  for (const incident of incidents) {
    const lat = parseFloat(incident.latitude);
    const lng = parseFloat(incident.longitude);

    if (isNaN(lat) || isNaN(lng)) continue;

    const pt = turf.point([lng, lat]);
    const distance = turf.pointToLineDistance(pt, routeLine, { units: 'kilometers' });

    if (distance <= corridorDistanceKm) {
      const incidentDate = incident.date ? new Date(incident.date).getTime() : null;
      const isRecent = incidentDate ? (now - incidentDate <= ninetyDaysMs) : false;
      const severity = (incident.severity || 'low').toLowerCase();
      const isVerified = (incident.verification_status || '').toLowerCase() === 'verified';

      if (severity === 'critical') criticalCount++;
      else if (severity === 'high') highCount++;
      else mediumLowCount++;

      if (isVerified) verifiedCount++;
      if (isRecent) recentCount++;

      totalFatalities += incident.fatalities || 0;
      totalInjured += incident.injured || 0;
      totalAbducted += incident.abducted || 0;

      corridorIncidents.push({
        ...incident,
        distanceToRouteKm: Math.round(distance * 10) / 10,
        isRecentRouteIncident: isRecent
      });
    }
  }

  // Sort by closest distance to route
  corridorIncidents.sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm);

  // Transparent, explainable risk scoring formula:
  // Base threat weighting + casualties factor + recency multiplier
  let rawScore = (criticalCount * 28) + (highCount * 14) + (mediumLowCount * 5);
  rawScore += recentCount * 6;
  rawScore += Math.min(totalFatalities * 3, 30);
  rawScore += Math.min(totalAbducted * 3, 20);

  // Normalize into 0-100 range
  const riskScore = Math.min(100, Math.round(rawScore));

  let riskLevel = 'LOW';
  let riskColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  let badgeLabel = 'LOW REPORTED EXPOSURE';

  if (riskScore >= 60 || criticalCount >= 2) {
    riskLevel = 'CRITICAL';
    riskColor = 'text-red-400 bg-red-500/10 border-red-500/30';
    badgeLabel = 'CRITICAL ROUTE EXPOSURE';
  } else if (riskScore >= 35 || criticalCount === 1 || highCount >= 2) {
    riskLevel = 'HIGH';
    riskColor = 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    badgeLabel = 'HIGH ROUTE EXPOSURE';
  } else if (riskScore >= 15 || corridorIncidents.length > 0) {
    riskLevel = 'MODERATE';
    riskColor = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    badgeLabel = 'MODERATE ROUTE EXPOSURE';
  }

  const disclaimer = corridorIncidents.length === 0
    ? 'No security incidents recorded in this corridor. This assessment is based on available reporting; lack of reported data is not verification of complete safety.'
    : `Assessment based on ${corridorIncidents.length} recorded incident(s) within ${corridorDistanceKm}km of route geometry. Operational caution is advised.`;

  return {
    corridorIncidents,
    totalCount: corridorIncidents.length,
    criticalCount,
    highCount,
    mediumLowCount,
    fatalities: totalFatalities,
    injured: totalInjured,
    abducted: totalAbducted,
    verifiedCount,
    recentCount,
    riskScore,
    riskLevel,
    riskColor,
    badgeLabel,
    corridorDistanceKm,
    disclaimer
  };
}
