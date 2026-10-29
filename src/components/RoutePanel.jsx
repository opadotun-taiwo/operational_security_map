import React, { useState, useMemo } from 'react';
import { 
  Navigation, 
  MapPin, 
  ArrowDownUp, 
  ShieldAlert, 
  Sliders, 
  AlertTriangle, 
  RotateCcw, 
  ChevronRight, 
  Clock, 
  Car,
  X
} from 'lucide-react';
import { calculateRoute } from '../services/routingService';
import { calculateRouteExposure, validateCoordinates } from '../utils/routeExposure';

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
      const temp = selectedOriginHubId;
      setSelectedOriginHubId(selectedDestHubId);
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

    try {
      setIsCalculating(true);
      const result = await calculateRoute({
        origin: { lat: resolvedOrigin.lat, lng: resolvedOrigin.lng },
        destination: { lat: resolvedDest.lat, lng: resolvedDest.lng },
        computeAlternativeRoutes: true
      });

      if (!result.routes || result.routes.length === 0) {
        setErrorMessage('No drivable route found between the specified points.');
        return;
      }

      // Compute security exposure for all returned route alternatives independently
      const evaluatedRoutes = result.routes.map((route) => {
        const exposure = calculateRouteExposure({
          routeCoordinates: route.coordinates,
          incidents: events,
          corridorDistanceKm
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
        source: result.source
      });

    } catch (err) {
      console.error('Route calculation error:', err);
      setErrorMessage(err.message || 'Route calculation failed. Please try again.');
    } finally {
      setIsCalculating(false);
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
      });
    }
  };

  const selectedRoute = activeRouteData?.routes?.[selectedRouteIndex] || activeRouteData?.routes?.[0];
  const exposure = selectedRoute?.exposure;

  if (!isOpen) return null;

  return (
    <div className="absolute top-4 left-4 z-40 w-full sm:w-[420px] max-h-[calc(100vh-2rem)] flex flex-col bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden transition-all duration-300">
      
      {/* Panel Header */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-800/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
            <Navigation size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Route Intelligence
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                GOOGLE ROUTES
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
              <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                <MapPin size={14} /> Origin (Departure)
              </span>
              <div className="flex items-center gap-1 bg-gray-900/80 p-0.5 rounded border border-gray-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setOriginType('hub')}
                  className={`px-2 py-0.5 rounded ${originType === 'hub' ? 'bg-emerald-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Hub
                </button>
                <button
                  type="button"
                  onClick={() => setOriginType('custom')}
                  className={`px-2 py-0.5 rounded ${originType === 'custom' ? 'bg-emerald-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Custom
                </button>
              </div>
            </div>

            {originType === 'hub' ? (
              <select
                value={effectiveOriginHubId}
                onChange={(e) => setSelectedOriginHubId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select Operational Hub...</option>
                {hubs.map(h => (
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
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Lng (e.g. 7.398)"
                  value={customOrigin.lng}
                  onChange={(e) => setCustomOrigin({ ...customOrigin, lng: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
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
              <span className="flex items-center gap-1.5 font-medium text-cyan-400">
                <MapPin size={14} /> Destination (Arrival)
              </span>
              <div className="flex items-center gap-1 bg-gray-900/80 p-0.5 rounded border border-gray-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDestType('hub')}
                  className={`px-2 py-0.5 rounded ${destType === 'hub' ? 'bg-cyan-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Hub
                </button>
                <button
                  type="button"
                  onClick={() => setDestType('custom')}
                  className={`px-2 py-0.5 rounded ${destType === 'custom' ? 'bg-cyan-600 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                  Custom
                </button>
              </div>
            </div>

            {destType === 'hub' ? (
              <select
                value={effectiveDestHubId}
                onChange={(e) => setSelectedDestHubId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select Operational Hub...</option>
                {hubs.map(h => (
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
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Lng (e.g. 6.547)"
                  value={customDest.lng}
                  onChange={(e) => setCustomDest({ ...customDest, lng: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}
          </div>

          {/* Corridor Buffer Distance Selector */}
          <div className="pt-2 border-t border-gray-700/60 flex items-center justify-between text-xs">
            <span className="text-gray-400 flex items-center gap-1.5 font-medium">
              <Sliders size={13} /> Corridor Threat Buffer:
            </span>
            <div className="flex items-center gap-1">
              {[2, 5, 10, 25].map(dist => (
                <button
                  key={`buffer-${dist}`}
                  type="button"
                  onClick={() => handleBufferChange(dist)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                    corridorBufferKm === dist 
                      ? 'bg-blue-600 text-white' 
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
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg text-sm"
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
            
            {/* Alternative Routes Switcher */}
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                Available Routes ({activeRouteData.routes.length})
              </p>
              <div className="space-y-2">
                {activeRouteData.routes.map((r, idx) => {
                  const isSelected = idx === selectedRouteIndex;
                  const routeExposure = r.exposure;

                  return (
                    <div
                      key={r.id || `route-${idx}`}
                      onClick={() => onSelectRouteIndex?.(idx)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-blue-900/30 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/50' 
                          : 'bg-gray-800/40 border-gray-700 hover:bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-gray-600'}`} />
                          <span className="font-bold text-white text-sm">{r.summary || `Route ${idx + 1}`}</span>
                          {idx === 0 && (
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/40">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${routeExposure?.riskColor || 'text-gray-400'}`}>
                          {routeExposure?.badgeLabel || 'ANALYZED'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-gray-300">
                            <Car size={13} className="text-gray-500" /> {r.distanceText}
                          </span>
                          <span className="flex items-center gap-1 text-gray-300">
                            <Clock size={13} className="text-gray-500" /> {r.durationText}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-gray-300">
                          {routeExposure?.totalCount || 0} incidents in {corridorBufferKm}km corridor
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Route Security Exposure Deep-Dive */}
            {exposure && (
              <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <ShieldAlert size={16} className={exposure.riskScore >= 35 ? 'text-red-400' : 'text-emerald-400'} />
                    Corridor Threat Profile
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
                                  isCrit ? 'bg-red-500/20 text-red-400' : isHi ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {inc.severity}
                                </span>
                                <span className="font-medium text-xs text-white group-hover:text-cyan-400 transition-colors">
                                  {inc.event_type || 'Incident'}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400">
                                {inc.location || inc.lga || inc.state} • {inc.date ? new Date(inc.date).toLocaleDateString() : 'N/A'}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono font-semibold text-cyan-400 block">
                                {inc.distanceToRouteKm} km
                              </span>
                              <span className="text-[10px] text-gray-500 flex items-center gap-0.5 justify-end">
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
