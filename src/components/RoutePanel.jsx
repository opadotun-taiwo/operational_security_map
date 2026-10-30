import React, { useState, useMemo, useRef } from 'react';
import { 
  Navigation, 
  ArrowDownUp, 
  ShieldAlert, 
  AlertTriangle, 
  RotateCcw, 
  ChevronRight, 
  Car,
  X
} from 'lucide-react';
import { calculateRoute } from '../services/routingService';
import { calculateRouteExposure, validateCoordinates } from '../utils/routeExposure';
import { compareRoutes, riskColor, routeLetter } from '../utils/routeComparison';

export default function RoutePanel({
  hubs = [],
  events = [],
  onRouteCalculated,
  onClearRoute,
  onSelectEvent,
  isOpen,
  onClose,
  activeRouteData,
  selectedRouteIndex = 0,
  onSelectRouteIndex
}) {
  const [originType, setOriginType] = useState('hub'); // 'hub' | 'custom'
  const [destType, setDestType] = useState('hub'); // 'hub' | 'custom'

  const [selectedOriginHubId, setSelectedOriginHubId] = useState('');
  const [selectedDestHubId, setSelectedDestHubId] = useState('');

  const [customOrigin, setCustomOrigin] = useState({ lat: '', lng: '', label: '' });
  const [customDest, setCustomDest] = useState({ lat: '', lng: '', label: '' });

  const [corridorBufferKm, setCorridorBufferKm] = useState(5);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  // Incremented per request so a slow, superseded calculation can't overwrite a newer one
  const requestIdRef = useRef(0);

  const effectiveOriginHubId = selectedOriginHubId || (hubs[0]?.id ? String(hubs[0].id) : '');
  const effectiveDestHubId = selectedDestHubId || (hubs[1]?.id ? String(hubs[1].id) : '');

  const originHub = useMemo(() => 
    hubs.find(h => String(h.id) === String(effectiveOriginHubId)),
    [hubs, effectiveOriginHubId]
  );

  const destHub = useMemo(() => 
    hubs.find(h => String(h.id) === String(effectiveDestHubId)),
    [hubs, effectiveDestHubId]
  );

  // Swap Origin and Destination
  const handleSwap = () => {
    if (originType === 'hub' && destType === 'hub') {
      const temp = effectiveOriginHubId;
      setSelectedOriginHubId(effectiveDestHubId);
      setSelectedDestHubId(temp);
    } else {
      const tempType = originType;
      const tempCustom = { ...customOrigin };
      setOriginType(destType);
      setCustomOrigin(customDest);
      setDestType(tempType);
      setCustomDest(tempCustom);
    }
  };

  const handleCalculateRoute = async () => {
    setErrorMessage(null);
    let resolvedOrigin = null;
    let resolvedDest = null;

    if (originType === 'hub') {
      if (!originHub) {
        setErrorMessage('Please select an operational hub as origin.');
        return;
      }
      resolvedOrigin = {
        lat: parseFloat(originHub.latitude),
        lng: parseFloat(originHub.longitude),
        label: originHub.location_name
      };
    } else {
      const check = validateCoordinates(customOrigin, true);
      if (!check.valid) {
        setErrorMessage(`Origin invalid: ${check.error}`);
        return;
      }
      resolvedOrigin = {
        lat: parseFloat(customOrigin.lat),
        lng: parseFloat(customOrigin.lng),
        label: customOrigin.label || `${customOrigin.lat}, ${customOrigin.lng}`
      };
    }

    if (destType === 'hub') {
      if (!destHub) {
        setErrorMessage('Please select an operational hub as destination.');
        return;
      }
      resolvedDest = {
        lat: parseFloat(destHub.latitude),
        lng: parseFloat(destHub.longitude),
        label: destHub.location_name
      };
    } else {
      const check = validateCoordinates(customDest, true);
      if (!check.valid) {
        setErrorMessage(`Destination invalid: ${check.error}`);
        return;
      }
      resolvedDest = {
        lat: parseFloat(customDest.lat),
        lng: parseFloat(customDest.lng),
        label: customDest.label || `${customDest.lat}, ${customDest.lng}`
      };
    }

    if (resolvedOrigin.lat === resolvedDest.lat && resolvedOrigin.lng === resolvedDest.lng) {
      setErrorMessage('Origin and Destination cannot be the same coordinates.');
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
        origin: { lat: resolvedOrigin.lat, lng: resolvedOrigin.lng },
        destination: { lat: resolvedDest.lat, lng: resolvedDest.lng },
        computeAlternativeRoutes: true
      });

      if (requestIdRef.current !== requestId) return;

      if (!result.routes || result.routes.length === 0) {
        setErrorMessage('No drivable route found between the specified points.');
        return;
      }

      // Compute security exposure for all returned route alternatives independently
      const evaluatedRoutes = result.routes.map((route) => {
        const exposure = calculateRouteExposure({
          routeCoordinates: route.coordinates,
          incidents: events,
          corridorDistanceKm: corridorBufferKm
        });
        return {
          ...route,
          exposure
        };
      });

      onRouteCalculated?.({
        origin: resolvedOrigin,
        destination: resolvedDest,
        routes: evaluatedRoutes,
        corridorBufferKm,
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

  // Re-evaluate routes when buffer distance changes
  const handleBufferChange = (newBuffer) => {
    setCorridorBufferKm(newBuffer);
    if (activeRouteData?.routes) {
      const reEvaluated = activeRouteData.routes.map(r => ({
        ...r,
        exposure: calculateRouteExposure({
          routeCoordinates: r.coordinates,
          incidents: events,
          corridorDistanceKm: newBuffer
        })
      }));
      onRouteCalculated?.({
        ...activeRouteData,
        routes: reEvaluated,
        corridorBufferKm: newBuffer
      }, { keepSelection: true });
    }
  };

  const selectedRoute = activeRouteData?.routes?.[selectedRouteIndex] || activeRouteData?.routes?.[0];
  const exposure = selectedRoute?.exposure;

  const comparison = useMemo(() => compareRoutes(activeRouteData?.routes || []), [activeRouteData]);
  const sortedHubs = useMemo(
    () => [...hubs].sort((a, b) => String(a.location_name || '').localeCompare(String(b.location_name || ''))),
    [hubs]
  );

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
            <p className="text-xs text-gray-400">Security corridor risk evaluation</p>
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

        {/* Origin / Destination Inputs */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/60 space-y-3">
          
          {/* Origin */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-300">
              <span className="flex items-center gap-1.5 font-medium text-green-400">
                <StepNumber n={1} /> Start from
              </span>
              <div className="flex items-center gap-1 bg-gray-900/80 p-0.5 rounded border border-gray-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setOriginType('hub')}
                  className={`px-2 py-0.5 rounded transition-colors ${originType === 'hub' ? 'bg-green-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Hub
                </button>
                <button
                  type="button"
                  onClick={() => setOriginType('custom')}
                  className={`px-2 py-0.5 rounded transition-colors ${originType === 'custom' ? 'bg-green-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Custom
                </button>
              </div>
            </div>

            {originType === 'hub' ? (
              <select
                value={effectiveOriginHubId}
                onChange={(e) => setSelectedOriginHubId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
              >
                <option value="">Select Operational Hub...</option>
                {sortedHubs.map(h => (
                  <option key={`orig-hub-${h.id}`} value={h.id}>
                    {h.location_name} ({h.state}) - {h.isThreatened ? '⚠️ Threatened' : '✓ Safe'}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Lat (e.g. 9.076)"
                  value={customOrigin.lat}
                  onChange={(e) => setCustomOrigin({ ...customOrigin, lat: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-green-500"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Lng (e.g. 7.398)"
                  value={customOrigin.lng}
                  onChange={(e) => setCustomOrigin({ ...customOrigin, lng: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-green-500"
                />
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -my-1">
            <button
              type="button"
              onClick={handleSwap}
              className="p-1.5 rounded-full bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors border border-gray-600 shadow"
              title="Swap Origin and Destination"
            >
              <ArrowDownUp size={14} />
            </button>
          </div>

          {/* Destination */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-300">
              <span className="flex items-center gap-1.5 font-medium text-green-400">
                <StepNumber n={2} /> Going to
              </span>
              <div className="flex items-center gap-1 bg-gray-900/80 p-0.5 rounded border border-gray-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDestType('hub')}
                  className={`px-2 py-0.5 rounded transition-colors ${destType === 'hub' ? 'bg-green-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Hub
                </button>
                <button
                  type="button"
                  onClick={() => setDestType('custom')}
                  className={`px-2 py-0.5 rounded transition-colors ${destType === 'custom' ? 'bg-green-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Custom
                </button>
              </div>
            </div>

            {destType === 'hub' ? (
              <select
                value={effectiveDestHubId}
                onChange={(e) => setSelectedDestHubId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
              >
                <option value="">Select Operational Hub...</option>
                {sortedHubs.map(h => (
                  <option key={`dest-hub-${h.id}`} value={h.id}>
                    {h.location_name} ({h.state}) - {h.isThreatened ? '⚠️ Threatened' : '✓ Safe'}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Lat (e.g. 9.615)"
                  value={customDest.lat}
                  onChange={(e) => setCustomDest({ ...customDest, lat: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-green-500"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Lng (e.g. 6.547)"
                  value={customDest.lng}
                  onChange={(e) => setCustomDest({ ...customDest, lng: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-green-500"
                />
              </div>
            )}
          </div>

          {/* Corridor Buffer Distance Selector */}
          <div className="pt-2 border-t border-gray-700/60 flex items-center justify-between text-xs">
            <span className="text-gray-400 flex items-center gap-1.5 font-medium">
              <StepNumber n={3} />
              <span title="Incidents within this distance of the road are counted as route threats">Check incidents within</span>
            </span>
            <div className="flex items-center gap-1">
              {[2, 5, 10, 25].map(dist => (
                <button
                  key={`buffer-${dist}`}
                  type="button"
                  onClick={() => handleBufferChange(dist)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                    corridorBufferKm === dist 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {dist}km
                </button>
              ))}
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
                  <Car size={16} /> Compute Driving Routes
                </>
              )}
            </button>

            {activeRouteData && (
              <button
                type="button"
                onClick={onClearRoute}
                className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg border border-gray-700 transition-colors"
                title="Clear Active Route"
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

            {/* Selected Route Security Exposure Deep-Dive */}
            {exposure && (
              <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <ShieldAlert size={16} className={exposure.riskScore >= 35 ? 'text-red-400' : 'text-green-400'} />
                    Route {routeLetter(selectedRouteIndex)} threat profile
                  </h3>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${exposure.riskColor}`}>
                    Score: {exposure.riskScore}/100
                  </span>
                </div>

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
                    <li>Cross-track distance computed with Turf.js: within {corridorBufferKm}km corridor.</li>
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
