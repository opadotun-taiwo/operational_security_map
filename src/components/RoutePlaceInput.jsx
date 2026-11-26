import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, LocateFixed, Crosshair, Home, MapPin, X, Loader2, Hash } from 'lucide-react';
import { searchPlaces, resolvePlace, newPlacesSession, currentPosition, reverseGeocode } from '../services/geocoding';
import { validateCoordinates } from '../utils/routeExposure';

/** Short readable name for a looked-up point. */
async function describePoint(lat, lng, fallback) {
  try {
    const address = await reverseGeocode(lat, lng);
    return [address.location, address.lga, address.state].filter(Boolean).slice(0, 2).join(', ') || address.formattedAddress || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Start / destination field for Route Intelligence: any place in Nigeria via search,
 * current GPS position, a click on the map, an OAF hub, or typed coordinates.
 *
 * `value` is { lat, lng, label, kind } or null.
 */
export default function RoutePlaceInput({
  label,
  step,
  value,
  onChange,
  hubs = [],
  allowCurrentLocation = false,
  isPicking = false,
  onTogglePick,
  pickedPoint
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [showCoords, setShowCoords] = useState(false);
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const sessionRef = useRef(null);
  const timerRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Close the suggestion list when clicking elsewhere
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const hubMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const valid = hubs.filter(h => !isNaN(parseFloat(h.latitude)) && !isNaN(parseFloat(h.longitude)));
    const matches = q
      ? valid.filter(h => `${h.location_name || ''} ${h.state || ''}`.toLowerCase().includes(q))
      : valid;
    return [...matches].sort((a, b) => String(a.location_name || '').localeCompare(String(b.location_name || ''))).slice(0, q ? 4 : 8);
  }, [hubs, query]);

  const choose = (next) => {
    onChange(next);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setError(null);
  };

  // A point clicked on the map for this field
  const lastPickRef = useRef(null);
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  useEffect(() => {
    if (!pickedPoint || pickedPoint === lastPickRef.current) return;
    lastPickRef.current = pickedPoint;
    const { lat, lng } = pickedPoint;
    Promise.resolve().then(async () => {
      setBusy('Looking up the place…');
      const name = await describePoint(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      setBusy(null);
      chooseRef.current({ lat, lng, label: name, kind: 'map' });
    });
  }, [pickedPoint]);

  const runSearch = (text) => {
    clearTimeout(timerRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        if (!sessionRef.current) sessionRef.current = await newPlacesSession();
        const results = await searchPlaces(text, sessionRef.current);
        setSuggestions(results);
        setError(results.length || hubMatches.length ? null : 'No places found. Try adding the town or state.');
      } catch (err) {
        setError(err.message);
      }
    }, 300);
  };

  const choosePlace = async (s) => {
    setOpen(false);
    setBusy('Getting the exact location…');
    try {
      const place = await resolvePlace(s.prediction);
      choose({ lat: place.lat, lng: place.lng, label: s.text, kind: 'place' });
    } catch (err) {
      setError(err.message);
    } finally {
      sessionRef.current = null;
      setBusy(null);
    }
  };

  const useMyLocation = async () => {
    setError(null);
    setBusy('Getting your current location…');
    try {
      const pos = await currentPosition();
      const name = await describePoint(pos.lat, pos.lng, 'Current location');
      choose({ lat: pos.lat, lng: pos.lng, label: `My location · ${name}`, kind: 'gps', accuracyM: pos.accuracyM });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const useCoordinates = async () => {
    const check = validateCoordinates(coords, true);
    if (!check.valid) {
      setError(check.error);
      return;
    }
    const lat = parseFloat(coords.lat);
    const lng = parseFloat(coords.lng);
    setBusy('Looking up the place…');
    const name = await describePoint(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    setBusy(null);
    setShowCoords(false);
    choose({ lat, lng, label: name, kind: 'coords' });
  };

  const kindIcon = { hub: Home, gps: LocateFixed, map: Crosshair, coords: Hash }[value?.kind] || MapPin;
  const KindIcon = kindIcon;

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
        <span className="w-4 h-4 rounded-full bg-green-600 text-white text-[10px] font-bold inline-flex items-center justify-center">{step}</span>
        {label}
      </span>

      {value ? (
        <div className="flex items-center gap-2 bg-gray-950 border border-green-700/60 rounded-lg px-3 py-2">
          <KindIcon size={15} className="text-green-400 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-white truncate" title={value.label}>{value.label}</span>
            <span className="block text-[11px] text-gray-500">
              {value.lat.toFixed(4)}, {value.lng.toFixed(4)}{value.accuracyM ? ` · ±${value.accuracyM} m` : ''}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label={`Change ${label.toLowerCase()}`}
            title="Change"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <div className="flex items-center bg-gray-950 border border-gray-700 rounded-lg focus-within:border-green-500">
              <Search size={15} className="ml-3 text-gray-500 shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setError(null); setOpen(true); runSearch(e.target.value); }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (hubMatches[0] && query.trim()) choose(hubToValue(hubMatches[0]));
                    else if (suggestions[0]) choosePlace(suggestions[0]);
                  }
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="Town, market, office or OAF hub"
                className="w-full bg-transparent px-2.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
                aria-label={`Search ${label.toLowerCase()}`}
              />
            </div>
            {open && (hubMatches.length > 0 || suggestions.length > 0) && (
              <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl" role="listbox">
                {hubMatches.length > 0 && (
                  <li className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500">OAF hubs</li>
                )}
                {hubMatches.map(h => (
                  <li key={`hub-${h.id}`}>
                    <button type="button" onClick={() => choose(hubToValue(h))} className="route-suggestion w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 flex items-center gap-2">
                      <Home size={14} className="shrink-0 text-emerald-400" />
                      <span className="truncate">{h.location_name}{h.state ? ` (${h.state})` : ''}</span>
                    </button>
                  </li>
                ))}
                {suggestions.length > 0 && (
                  <li className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500 border-t border-gray-800">Places</li>
                )}
                {suggestions.map(s => (
                  <li key={s.id}>
                    <button type="button" onClick={() => choosePlace(s)} className="route-suggestion w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-green-400" />
                      <span>{s.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`grid gap-1.5 ${allowCurrentLocation ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {allowCurrentLocation && (
              <SmallButton onClick={useMyLocation} icon={LocateFixed}>My location</SmallButton>
            )}
            <SmallButton onClick={onTogglePick} icon={Crosshair} active={isPicking}>
              {isPicking ? 'Click map…' : 'Pick on map'}
            </SmallButton>
            <SmallButton onClick={() => setShowCoords(v => !v)} icon={Hash} active={showCoords}>Coordinates</SmallButton>
          </div>

          {showCoords && (
            <div className="flex gap-1.5">
              {['lat', 'lng'].map(key => (
                <input
                  key={key}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={coords[key]}
                  onChange={(e) => setCoords(c => ({ ...c, [key]: e.target.value }))}
                  placeholder={key === 'lat' ? 'Latitude' : 'Longitude'}
                  aria-label={`${label} ${key === 'lat' ? 'latitude' : 'longitude'}`}
                  className="w-full min-w-0 bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-green-500"
                />
              ))}
              <button type="button" onClick={useCoordinates} className="px-3 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium">
                Use
              </button>
            </div>
          )}
        </>
      )}

      {busy && <p className="text-[11px] text-gray-300 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {busy}</p>}
      {error && <p className="text-[11px] text-yellow-300">{error}</p>}
    </div>
  );
}

function hubToValue(hub) {
  return {
    lat: parseFloat(hub.latitude),
    lng: parseFloat(hub.longitude),
    label: `${hub.location_name || 'OAF hub'} hub${hub.state ? ` (${hub.state})` : ''}`,
    kind: 'hub'
  };
}

function SmallButton({ onClick, icon: Icon, active = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border transition-colors ${
        active
          ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-200'
          : 'bg-gray-900 border-gray-700 text-gray-200 hover:border-green-500 hover:text-white'
      }`}
    >
      <Icon size={12} /> {children}
    </button>
  );
}
