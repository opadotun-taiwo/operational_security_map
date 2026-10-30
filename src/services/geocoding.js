/**
 * Location lookups for incident reports, using the Maps JavaScript API (Geocoding
 * and Places API (New)); both are already loaded on the page with the map.
 */

const TIMEOUT_MS = 8000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Location lookup timed out')), ms))
  ]);
}

function importLibrary(name) {
  if (typeof window === 'undefined' || !window.google?.maps?.importLibrary) {
    return Promise.reject(new Error('Google Maps is still loading. Try again in a moment.'));
  }
  return window.google.maps.importLibrary(name);
}

const readNumber = (v) => (typeof v === 'function' ? v() : v);

/**
 * Maps Google address components (Geocoder `long_name` or Places `longText`) to the
 * incident table's state / lga / location columns. In Nigeria, administrative area
 * level 1 is the state and level 2 the LGA.
 */
export function parseAddressComponents(components = [], placeName = '') {
  const find = (type) => {
    const c = components.find(comp => comp.types?.includes(type));
    return c ? (c.long_name ?? c.longText ?? '') : '';
  };

  const state = find('administrative_area_level_1').replace(/\s+State$/i, '').trim();
  const lga = find('administrative_area_level_2').replace(/\s+Local Government Area$/i, '').trim();
  const locality = find('locality') || find('administrative_area_level_3') || find('sublocality');
  const street = find('route') || find('neighborhood') || find('premise');

  const parts = [];
  for (const part of [placeName, street, locality]) {
    if (part && !parts.some(p => p.toLowerCase() === part.toLowerCase())) parts.push(part);
  }

  return { state, lga, location: parts.slice(0, 2).join(', '), country: find('country') };
}

const PRECISE_TYPES = ['ROOFTOP', 'RANGE_INTERPOLATED'];

/**
 * Coordinates → state, LGA and place name.
 *
 * @returns {Promise<{ state: string, lga: string, location: string, formattedAddress: string }>}
 */
export async function reverseGeocode(lat, lng) {
  const { Geocoder } = await importLibrary('geocoding');
  const { results } = await withTimeout(new Geocoder().geocode({ location: { lat, lng } }));
  if (!results?.length) throw new Error('No address found for this location');
  // The first result is the most specific; state/LGA may only be on broader results
  const merged = results.flatMap(r => r.address_components || []);
  const specific = parseAddressComponents(results[0].address_components);
  const broad = parseAddressComponents(merged);
  return {
    state: specific.state || broad.state,
    lga: specific.lga || broad.lga,
    location: specific.location || broad.location,
    country: specific.country || broad.country,
    formattedAddress: results[0].formatted_address || ''
  };
}

/**
 * Address text → coordinates plus state/LGA/place, restricted to Nigeria.
 *
 * @returns {Promise<{ lat: number, lng: number, precise: boolean, state: string, lga: string, location: string, formattedAddress: string }>}
 */
export async function geocodeAddress(address) {
  const { Geocoder } = await importLibrary('geocoding');
  const { results } = await withTimeout(new Geocoder().geocode({ address, componentRestrictions: { country: 'NG' } }));
  if (!results?.length) throw new Error(`No match found for "${address}"`);
  const top = results[0];
  const loc = top.geometry.location;
  return {
    lat: readNumber(loc.lat),
    lng: readNumber(loc.lng),
    precise: PRECISE_TYPES.includes(top.geometry.location_type),
    ...parseAddressComponents(top.address_components),
    formattedAddress: top.formatted_address || ''
  };
}

/**
 * Place search suggestions inside Nigeria (Places API (New)).
 *
 * @returns {Promise<Array<{ id: string, text: string, prediction: Object }>>}
 */
export async function searchPlaces(input, sessionToken) {
  if (!input || input.trim().length < 3) return [];
  const { AutocompleteSuggestion } = await importLibrary('places');
  const { suggestions } = await withTimeout(AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    includedRegionCodes: ['ng'],
    sessionToken
  }));
  return (suggestions || [])
    .map(s => s.placePrediction)
    .filter(Boolean)
    .map(prediction => ({ id: prediction.placeId, text: prediction.text?.text || '', prediction }));
}

/** New autocomplete session token (groups keystrokes + selection into one billable session). */
export async function newPlacesSession() {
  const { AutocompleteSessionToken } = await importLibrary('places');
  return new AutocompleteSessionToken();
}

/**
 * Resolves a selected suggestion to exact coordinates and address parts.
 */
export async function resolvePlace(prediction) {
  const place = prediction.toPlace();
  await withTimeout(place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress', 'addressComponents'] }));
  return {
    lat: readNumber(place.location.lat),
    lng: readNumber(place.location.lng),
    precise: true,
    ...parseAddressComponents(place.addressComponents, place.displayName || ''),
    formattedAddress: place.formattedAddress || ''
  };
}

/**
 * Current device position (high accuracy).
 *
 * @returns {Promise<{ lat: number, lng: number, accuracyM: number }>}
 */
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy) }),
      (err) => reject(new Error(err.code === 1 ? 'Location permission was denied.' : 'Could not get your current location.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
