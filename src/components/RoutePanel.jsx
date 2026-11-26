import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Navigation, 
  ArrowDownUp, 
  ShieldAlert, 
  AlertTriangle, 
  RotateCcw, 
  ChevronRight, 
  Car,
  X,
  ExternalLink,
  Loader2,
  Info
} from 'lucide-react';
import { calculateRoute } from '../services/routingService';
import { reverseGeocode } from '../services/geocoding';
import { calculateRouteExposure } from '../utils/routeExposure';
import { compareRoutes, riskColor, routeLetter } from '../utils/routeComparison';
import {
  LOOKBACK_OPTIONS,
  DEFAULT_LOOKBACK,
  lookbackDays,
  filterByLookback,
  sampleRoute,
  buildStretches,
  summarizeJourney,
  googleMapsDirectionsUrl
} from '../utils/journey';
import RoutePlaceInput from './RoutePlaceInput';

const BUFFER_OPTIONS = [2, 5, 10, 25];

/** Scores a route against incidents and, once its LGAs are known, splits it into stretches. */
function evaluateRoute(route, incidents, corridorDistanceKm) {
  const exposure = calculateRouteExposure({ routeCoordinates: route.coordinates, incidents, corridorDistanceKm });
  const stretches = route.samples
    ? buildStretches(route.coordinates, route.samples, exposure.corridorIncidents, corridorDistanceKm)
    : null;
  return { ...route, exposure, stretches };
}

/** Looks up the LGA and state of each sample point along a route (4 requests at a time). */
async function labelRouteSamples(samples) {
  const labelled = new Array(samples.length);
  let next = 0;
  const worker = async () => {
    while (next < samples.length) {
      const i = next++;
      const [lng, lat] = samples[i].point;
      try {
        const place = await reverseGeocode(lat, lng);
        labelled[i] = { ...samples[i], lga: place.lga, state: place.state };
      } catch {
        labelled[i] = { ...samples[i], lga: '', state: '' };
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  // No names at all (lookups unavailable): fall back to equal numbered sections
  if (labelled.every(s => !s.lga)) {
    const per = Math.max(1, Math.ceil(labelled.length / 5));
    return labelled.map((s, i) => ({ ...s, lga: `Section ${Math.floor(i / per) + 1}` }));
  }
  return labelled;
}

export default function RoutePanel({
  hubs = [],
  events = [],
  operatingStates = [],
  onRouteCalculated,
  onUpdateRouteData,
  onClearRoute,
  onSelectEvent,
  isOpen,
  onClose,
  activeRouteData,
  selectedRouteIndex = 0,
  onSelectRouteIndex,
  pickingFor,
  onTogglePick,
  routePick
}) {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [corridorBufferKm, setCorridorBufferKm] = useState(5);
  const [lookback, setLookback] = useState(DEFAULT_LOOKBACK);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  // Incremented per request so a slow, superseded calculation can't overwrite a newer one
  const requestIdRef = useRef(0);

  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const lookbackLabel = LOOKBACK_OPTIONS.find(o => o.id === lookback)?.label;

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleCalculateRoute = async () => {
    setErrorMessage(null);
    if (!origin || !destination) {
      setErrorMessage(!origin ? 'Choose where you are starting from.' : 'Choose where you are going.');
      return;
    }
    if (Math.abs(origin.lat - destination.lat) < 1e-5 && Math.abs(origin.lng - destination.lng) < 1e-5) {
      setErrorMessage('Start and destination are the same place.');
      return;
    }

    // Safety watchdog so the button cannot spin indefinitely. It must outlast the
    // combined per-provider timeouts in calculateRoute (8s + 6s + 8s).
    const requestId = ++requestIdRef.current;
    let watchdogTimer = null;

    try {
      setIsCalculating(true);

      watchdogTimer = setTimeout(() => {
        if (requestIdRef.current !== requestId) return;
        requestIdRef.current++;
        setIsCalculating(false);
        setErrorMessage('Route calculation took longer than expected. Please retry.');
      }, 30000);

      const result = await calculateRoute({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        computeAlternativeRoutes: true
      });

      if (requestIdRef.current !== requestId) return;

      if (!result.routes || result.routes.length === 0) {
        setErrorMessage('No drivable route found between the specified points.');
        return;
      }

      const incidents = filterByLookback(events, lookbackDays(lookback));
      onRouteCalculated?.({
        tripId: `${Date.now()}`,
        origin,
        destination,
        routes: result.routes.map(route => evaluateRoute(route, incidents, corridorBufferKm)),
        corridorBufferKm,
        lookback,
        source: result.source,
        isEstimate: Boolean(result.isEstimate)
      });

    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error('Route calculation error:', err);
      setErrorMessage(err.message || 'Route calculation failed. Please try again.');
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (requestIdRef.current === requestId) setIsCalculating(false);
    }
  };

  // Re-score every route when the corridor width or look-back period changes
  const reEvaluate = (buffer, lookbackId) => {
    setCorridorBufferKm(buffer);
    setLookback(lookbackId);
    const incidents = filterByLookback(events, lookbackDays(lookbackId));
    onUpdateRouteData?.(prev => prev && ({
      ...prev,
      corridorBufferKm: buffer,
      lookback: lookbackId,
      routes: prev.routes.map(r => evaluateRoute(r, incidents, buffer))
    }));
  };

  const selectedRoute = activeRouteData?.routes?.[selectedRouteIndex] || activeRouteData?.routes?.[0];
  const exposure = selectedRoute?.exposure;

  // Find the LGAs along the selected route (once per route) to build the journey stretches
  const labelledRef = useRef(new Set());
  const tripId = activeRouteData?.tripId;
  const selectedRouteId = selectedRoute?.id;
  useEffect(() => {
    if (!tripId || !selectedRouteId || activeRouteData?.isEstimate) return;
    const key = `${tripId}:${selectedRouteId}`;
    const route = activeRouteData.routes.find(r => r.id === selectedRouteId);
    if (!route || route.samples || labelledRef.current.has(key)) return;
    labelledRef.current.add(key);

    labelRouteSamples(sampleRoute(route.coordinates)).then(samples => {
      onUpdateRouteData?.(prev => {
        if (!prev || prev.tripId !== tripId) return prev;
        const incidents = filterByLookback(eventsRef.current, lookbackDays(prev.lookback));
        return {
          ...prev,
          routes: prev.routes.map(r => (r.id === selectedRouteId ? evaluateRoute({ ...r, samples }, incidents, prev.corridorBufferKm) : r))
        };
      });
    });
  }, [tripId, selectedRouteId, activeRouteData, onUpdateRouteData]);

  const comparison = useMemo(() => compareRoutes(activeRouteData?.routes || []), [activeRouteData]);
  const journey = useMemo(() => (
    selectedRoute?.stretches
      ? summarizeJourney(selectedRoute.stretches, { corridorDistanceKm: activeRouteData.corridorBufferKm, lookbackLabel, operatingStates })
      : null
  ), [selectedRoute, activeRouteData, lookbackLabel, operatingStates]);
  const mapsUrl = useMemo(() => (
    selectedRoute && activeRouteData?.origin && activeRouteData?.destination
      ? googleMapsDirectionsUrl(activeRouteData.origin, activeRouteData.destination, selectedRoute.coordinates)
      : null
  ), [selectedRoute, activeRouteData]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-4 left-4 z-40 w-full sm:w-[420px] max-h-[calc(100%-2rem)] flex flex-col bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden transition-all duration-300">
      
      {/* Panel Header */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-800/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-green-600/20 text-green-400 rounded-lg border border-green-500/30">
            <Navigation size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Route Intelligence
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-950 text-green-400 border border-green-800">
                {activeRouteData?.source ? activeRouteData.source.toUpperCase() : 'ONE SECURE'}
              </span>
            </h2>
            <p className="text-xs text-gray-400">Plan a trip anywhere in Nigeria and see the security picture along the road</p>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Close Route Planner"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Body */}
      <div className="p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar text-sm">

        {/* Start / Destination */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/60 space-y-3">
          <RoutePlaceInput
            label="Starting from"
            step={1}
            value={origin}
            onChange={setOrigin}
            hubs={hubs}
            allowCurrentLocation
            isPicking={pickingFor === 'origin'}
            onTogglePick={() => onTogglePick?.('origin')}
            pickedPoint={routePick?.target === 'origin' ? routePick : null}
          />

          <div className="flex justify-center -my-1">
            <button
              type="button"
              onClick={handleSwap}
              className="p-1.5 rounded-full bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors border border-gray-600 shadow"
              title="Swap start and destination"
              aria-label="Swap start and destination"
            >
              <ArrowDownUp size={14} />
            </button>
          </div>

          <RoutePlaceInput
            label="Going to"
            step={2}
            value={destination}
            onChange={setDestination}
            hubs={hubs}
            isPicking={pickingFor === 'destination'}
            onTogglePick={() => onTogglePick?.('destination')}
            pickedPoint={routePick?.target === 'destination' ? routePick : null}
          />

          {/* Corridor width and look-back period */}
          <div className="pt-2 border-t border-gray-700/60 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 flex items-center gap-1.5 font-medium">
                <StepNumber n={3} />
                <span title="Incidents within this distance of the road are counted">Incidents within</span>
              </span>
              <Segmented
                options={BUFFER_OPTIONS.map(d => ({ id: d, label: `${d}km` }))}
                value={corridorBufferKm}
                onChange={(d) => reEvaluate(d, lookback)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 font-medium pl-5">in the last</span>
              <Segmented
                options={LOOKBACK_OPTIONS.map(o => ({ id: o.id, label: o.label }))}
                value={lookback}
                onChange={(id) => reEvaluate(corridorBufferKm, id)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={isCalculating}
              onClick={handleCalculateRoute}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-900/60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-950/40 text-sm"
            >
              {isCalculating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Calculating Routes...
                </>
              ) : (
                <>
                  <Car size={16} /> Check routes
                </>
              )}
            </button>

            {activeRouteData && (
              <button
                type="button"
                onClick={onClearRoute}
                className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg border border-gray-700 transition-colors"
                title="Clear route"
                aria-label="Clear route"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Route Exposure Results */}
        {activeRouteData?.routes && activeRouteData.routes.length > 0 && (
          <div className="space-y-4">

            {activeRouteData.isEstimate && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-200 text-xs flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 text-yellow-400 mt-0.5" />
                <span>
                  Road routing services were unavailable, so this is a straight-line estimate.
                  Distance, travel time and corridor threats will not match the actual road. Retry before relying on it.
                </span>
              </div>
            )}
            
            {/* Plain-language recommendation */}
            {!activeRouteData.isEstimate && comparison.summary && (
              <div className="p-3.5 rounded-xl border border-green-500/30 bg-green-500/10 text-sm text-green-50 leading-relaxed flex items-start gap-2.5">
                <ShieldAlert size={18} className="shrink-0 text-green-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-300 text-xs uppercase tracking-wider mb-0.5">Recommendation</p>
                  <p>{comparison.summary}</p>
                  {activeRouteData.routes.length > 1 && (
                    <p className="text-xs text-green-200/70 mt-1">Click a route below or on the map to compare it.</p>
                  )}
                </div>
              </div>
            )}

            {/* Route alternatives (letters match the labels on the map) */}
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                {activeRouteData.routes.length > 1 ? `${activeRouteData.routes.length} route options` : '1 route option'}
              </p>
              <div className="space-y-2" role="radiogroup" aria-label="Route options">
                {activeRouteData.routes.map((r, idx) => {
                  const isSelected = idx === selectedRouteIndex;
                  const routeExposure = r.exposure;
                  const color = riskColor(routeExposure?.riskLevel);
                  const isSafest = activeRouteData.routes.length > 1 && idx === comparison.safestIndex;
                  const isFastest = activeRouteData.routes.length > 1 && idx === comparison.fastestIndex;

                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      key={r.id || `route-${idx}`}
                      onClick={() => onSelectRouteIndex?.(idx)}
                      className={`route-option w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                        isSelected 
                          ? 'bg-gray-800 border-white/70 ring-1 ring-white/40 shadow-lg' 
                          : 'bg-gray-800/40 border-gray-700 hover:bg-gray-800 hover:border-gray-500'
                      }`}
                    >
                      <span
                        className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-black text-gray-950"
                        style={{ backgroundColor: isSelected ? color : '#cbd5e1' }}
                      >
                        {routeLetter(idx)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white text-sm">{r.durationText}</span>
                          <span className="text-gray-400 text-xs">· {r.distanceText}</span>
                          {isSafest && <Tag className="bg-green-500/20 text-green-300 border-green-500/40">SAFEST</Tag>}
                          {isFastest && <Tag className="bg-sky-500/20 text-sky-300 border-sky-500/40">FASTEST</Tag>}
                          {isSelected && <Tag className="bg-white/10 text-white border-white/30">ON MAP</Tag>}
                        </span>
                        <span className="block text-xs text-gray-400 truncate mt-0.5" title={r.summary}>{r.summary || `Route ${idx + 1}`}</span>
                        <span className="flex items-center gap-1.5 text-xs mt-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-gray-200 font-medium">
                            {routeExposure?.totalCount || 0} incident{routeExposure?.totalCount === 1 ? '' : 's'} within {corridorBufferKm} km
                          </span>
                          <span className="text-gray-500">· {(routeExposure?.riskLevel || 'unknown').toLowerCase()} risk</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Journey guidance for the selected route, stretch by stretch */}
            {selectedRoute && (
              <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Navigation size={16} className="text-green-400" />
                    Route {routeLetter(selectedRouteIndex)} journey guide
                  </h3>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-gray-950 bg-green-400 hover:bg-green-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                      title="Open this route in Google Maps for turn-by-turn directions"
                    >
                      Start in Google Maps <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                {activeRouteData.isEstimate ? (
                  <p className="text-xs text-gray-400">Journey stretches need a road route. Retry when road routing is available.</p>
                ) : !selectedRoute.stretches ? (
                  <p className="text-xs text-gray-300 flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" /> Mapping the LGAs along the route…
                  </p>
                ) : (
                  <>
                    {journey && (
                      <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
                        selectedRoute.stretches.some(st => st.incidents.length)
                          ? 'border-orange-500/30 bg-orange-500/10 text-orange-50'
                          : 'border-gray-600 bg-gray-900/60 text-gray-200'
                      }`}>
                        <p className="font-semibold">{journey.headline}</p>
                        {journey.advice && <p className="mt-1 opacity-90">{journey.advice}</p>}
                      </div>
                    )}
                    {journey?.outsideStates.length > 0 && (
                      <p className="text-[11px] text-yellow-200/90 flex items-start gap-1.5">
                        <Info size={13} className="shrink-0 mt-px" />
                        This route passes through {journey.outsideStates.join(', ')}, outside OAF&apos;s operating states. Incident records there may be incomplete.
                      </p>
                    )}

                    <ol className="space-y-1.5" aria-label="Journey stretches in travel order">
                      {selectedRoute.stretches.map((st, i) => {
                        const color = riskColor(st.exposure.riskLevel);
                        const count = st.incidents.length;
                        return (
                          <li key={`${st.startKm}-${i}`} className="journey-stretch rounded-lg bg-gray-900/70 border border-gray-800 overflow-hidden">
                            <details className="group">
                              <summary className={`flex items-stretch gap-2.5 ${count ? 'cursor-pointer' : 'cursor-default'} list-none`}>
                                <span className="w-1.5 shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                                <span className="flex-1 min-w-0 py-2 pr-2.5">
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-mono text-gray-400 shrink-0">km {st.startKm}–{st.endKm}</span>
                                    <span className={`text-[11px] font-semibold ${count ? 'text-white' : 'text-gray-500'}`}>
                                      {count ? `${count} incident${count === 1 ? '' : 's'} · ${st.exposure.riskLevel.toLowerCase()}` : 'No incidents'}
                                    </span>
                                  </span>
                                  <span className="block text-xs text-gray-200 truncate" title={st.label}>{st.label}</span>
                                  {st.topTypes.length > 0 && (
                                    <span className="block text-[11px] text-gray-400 truncate">
                                      {st.topTypes.map(t => `${t.count} ${t.type.toLowerCase()}`).join(', ')}
                                      <span className="text-gray-500 group-open:hidden"> · show</span>
                                    </span>
                                  )}
                                </span>
                              </summary>
                              {count > 0 && (
                                <ul className="px-3 pb-2 space-y-1">
                                  {st.incidents.map(inc => (
                                    <li key={inc.event_id || inc.id}>
                                      <button
                                        type="button"
                                        onClick={() => onSelectEvent?.(inc)}
                                        className="w-full text-left text-[11px] text-gray-300 hover:text-white flex items-center justify-between gap-2 py-0.5"
                                      >
                                        <span className="truncate">
                                          {inc.event_type || 'Incident'} · {inc.date ? new Date(inc.date).toLocaleDateString() : 'No date'}
                                          {inc.lga ? ` · ${inc.lga}` : ''}
                                        </span>
                                        <span className="font-mono text-green-400 shrink-0">{inc.distanceToRouteKm} km off road</span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </details>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
              </div>
            )}

            {/* Score details for the selected route */}
            {exposure && (
              <details className="bg-gray-800/60 rounded-xl border border-gray-700">
                <summary className="px-4 py-3 cursor-pointer text-sm font-bold text-white flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShieldAlert size={16} className={exposure.riskScore >= 35 ? 'text-red-400' : 'text-green-400'} />
                    Route {routeLetter(selectedRouteIndex)} score details
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${exposure.riskColor}`}>
                    Score: {exposure.riskScore}/100
                  </span>
                </summary>
              <div className="px-4 pb-4 space-y-4">
                {/* Metrics Breakdown */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-gray-900/80 p-2 rounded-lg border border-gray-800">
                    <span className="block text-base font-bold text-white">{exposure.totalCount}</span>
                    <span className="text-[10px] text-gray-400 uppercase">Incidents</span>
                  </div>
                  <div className="bg-gray-900/80 p-2 rounded-lg border border-gray-800">
                    <span className="block text-base font-bold text-red-400">{exposure.criticalCount}</span>
                    <span className="text-[10px] text-gray-400 uppercase">Critical</span>
                  </div>
                  <div className="bg-gray-900/80 p-2 rounded-lg border border-gray-800">
                    <span className="block text-base font-bold text-orange-400">{exposure.fatalities}</span>
                    <span className="text-[10px] text-gray-400 uppercase">Casualties</span>
                  </div>
                  <div className="bg-gray-900/80 p-2 rounded-lg border border-gray-800">
                    <span className="block text-base font-bold text-yellow-400">{exposure.recentCount}</span>
                    <span className="text-[10px] text-gray-400 uppercase">Recent (90d)</span>
                  </div>
                </div>

                {/* Auditable Evaluation Criteria */}
                <div className="text-xs bg-gray-900/60 p-3 rounded-lg border border-gray-800 space-y-1.5 text-gray-400">
                  <p className="font-semibold text-gray-300">Auditable Assessment Criteria:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li>Distance from the road computed with Turf.js: within {corridorBufferKm}km of the route, incidents from the last {lookbackLabel}.</li>
                    <li>Severity weighting: Critical (28pt), High (14pt), Med/Low (5pt).</li>
                    <li>Casualty and abduction factor weighted into composite score.</li>
                    <li>Verification: {exposure.verifiedCount} of {exposure.totalCount} verified by formal sources.</li>
                  </ul>
                </div>

                {/* Important Risk Advisory Notice */}
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-[11px] text-yellow-300/90 leading-relaxed">
                  <p className="font-semibold text-yellow-400 mb-0.5 flex items-center gap-1.5">
                    <AlertTriangle size={13} /> Decision-Support Intelligence Notice
                  </p>
                  {exposure.disclaimer}
                </div>

                {/* Corridor Incidents List */}
                {exposure.corridorIncidents.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-gray-700/60">
                    <p className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                      <span>Corridor Incidents ({exposure.corridorIncidents.length})</span>
                      <span className="text-[11px] text-gray-500">Sorted by distance</span>
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {exposure.corridorIncidents.map(inc => {
                        const isCrit = inc.severity?.toLowerCase() === 'critical';
                        const isHi = inc.severity?.toLowerCase() === 'high';

                        return (
                          <div
                            key={inc.event_id || inc.id}
                            onClick={() => onSelectEvent?.(inc)}
                            className="bg-gray-900/90 hover:bg-gray-900 p-2.5 rounded-lg border border-gray-800 hover:border-gray-700 cursor-pointer transition-colors flex items-center justify-between group"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  isCrit ? 'bg-red-500/20 text-red-400' : isHi ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                                }`}>
                                  {inc.severity}
                                </span>
                                <span className="font-medium text-xs text-white group-hover:text-green-400 transition-colors">
                                  {inc.event_type || 'Incident'}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400">
                                {inc.location || inc.lga || inc.state} • {inc.date ? new Date(inc.date).toLocaleDateString() : 'N/A'}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono font-semibold text-green-400 block">
                                {inc.distanceToRouteKm} km
                              </span>
                              <span className="text-[10px] text-gray-500 flex items-center gap-0.5 justify-end group-hover:text-gray-300">
                                Inspect <ChevronRight size={10} />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-2">
                    No recorded security incidents within {corridorBufferKm}km of this route.
                  </p>
                )}

              </div>
              </details>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

function StepNumber({ n }) {
  return (
    <span className="w-4 h-4 rounded-full bg-green-600 text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0">
      {n}
    </span>
  );
}

function Tag({ className, children }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-px rounded border ${className}`}>
      {children}
    </span>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`px-2 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
            value === o.id ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
