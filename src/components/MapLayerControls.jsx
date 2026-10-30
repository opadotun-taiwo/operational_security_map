import React from 'react';
import { Layers, MapPin, Home, Activity, Flame, ShieldAlert, CheckCircle2, Route, Info } from 'lucide-react';

export default function MapLayerControls({ 
  mapLayers, 
  setMapLayers, 
  hotspotSettings, 
  setHotspotSettings,
  hubRadiusKm
}) {
  // Start collapsed on phones so the panel doesn't cover the map
  const [isOpen, setIsOpen] = React.useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  
  const toggleLayer = (layer) => {
    setMapLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-3 w-72 items-end max-h-[calc(100%-2rem)] overflow-y-auto custom-scrollbar">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-900/90 backdrop-blur-md rounded-xl p-3 border border-gray-800 shadow-xl text-white hover:bg-gray-800 transition-colors flex items-center justify-center tutorial-step-3"
        title={isOpen ? "Collapse Controls" : "Expand Controls"}
      >
        <Layers className="w-5 h-5 text-green-400" />
      </button>

      {isOpen && (
        <div className="flex flex-col gap-3 w-full">
          {/* Layer Controls */}
          <div className="bg-gray-900/95 backdrop-blur-md rounded-xl border border-gray-800 shadow-xl overflow-hidden w-full">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 bg-gray-800/40">
              <Layers className="w-4 h-4 text-green-400" />
              <h3 className="font-semibold text-white text-sm">Map Layers</h3>
            </div>
            <div className="p-2 flex flex-col gap-1">
              <LayerToggle 
                icon={<MapPin className="w-4 h-4 text-green-400" />}
                label="Security Incidents" 
                isActive={mapLayers.incidents} 
                onClick={() => toggleLayer('incidents')} 
              />
              <LayerToggle 
                icon={<Home className="w-4 h-4 text-emerald-400" />}
                label="Operational Hubs" 
                isActive={mapLayers.hubs} 
                onClick={() => toggleLayer('hubs')} 
              />
              <LayerToggle 
                icon={<ShieldAlert className="w-4 h-4 text-yellow-400" />}
                label={typeof hubRadiusKm === 'number' ? `Hub Areas (${hubRadiusKm} km) & Alert Zones` : 'Hub Alert Zones (5 km)'}
                isActive={mapLayers.proximity} 
                onClick={() => toggleLayer('proximity')} 
              />
              <LayerToggle 
                icon={<Flame className="w-4 h-4 text-orange-500" />}
                label="Security Hotspots" 
                isActive={mapLayers.hotspots} 
                onClick={() => toggleLayer('hotspots')} 
              />
            </div>

            {/* Hotspot Fine-tuning Controls */}
            {mapLayers.hotspots && hotspotSettings && setHotspotSettings && (
              <div className="p-3 bg-gray-950/70 border-t border-gray-800/80 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-gray-300">
                  <span className="font-semibold text-[11px] text-orange-400 uppercase tracking-wider flex items-center gap-1">
                    <Flame size={12} /> Hotspot Configuration
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400">Time Horizon:</label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'all', label: 'All Time' },
                      { id: '90d', label: 'Past 90d' },
                      { id: '30d', label: 'Past 30d' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setHotspotSettings(s => ({ ...s, timeHorizon: tab.id }))}
                        className={`py-1 rounded text-[10px] font-medium transition-colors ${
                          hotspotSettings.timeHorizon === tab.id
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-gray-400">Weight by Severity:</span>
                  <input
                    type="checkbox"
                    checked={Boolean(hotspotSettings.weightedBySeverity)}
                    onChange={(e) => setHotspotSettings(s => ({ ...s, weightedBySeverity: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded bg-gray-800 border-gray-700 text-orange-500 focus:ring-orange-500"
                  />
                </div>

                <div className="p-2 bg-gray-900 rounded border border-gray-800 text-[10px] text-gray-400 flex items-start gap-1.5 leading-snug">
                  <Info size={12} className="shrink-0 text-gray-500 mt-0.5" />
                  <span>Concentration represents reported incident clusters; absence does not establish area safety.</span>
                </div>
              </div>
            )}
          </div>

          {/* Operational Legend */}
          <div className="bg-gray-900/95 backdrop-blur-md rounded-xl border border-gray-800 shadow-xl overflow-hidden w-full">
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2 bg-gray-800/40">
              <Activity className="w-4 h-4 text-green-400" />
              <h3 className="font-semibold text-white text-xs">Operating Legend</h3>
            </div>
            <div className="p-3 flex flex-col gap-2.5 text-xs">
              <LegendItem color="bg-red-500" label="Critical Severity Threat" />
              <LegendItem color="bg-orange-500" label="High Severity Event" />
              <LegendItem color="bg-emerald-500" label="Medium / Low Event" />
              
              <div className="flex items-center gap-2.5 mt-0.5">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500 flex items-center justify-center">
                  <CheckCircle2 size={9} strokeWidth={3} />
                </div>
                <span className="text-gray-300 text-[11px]">Verified Intelligence</span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative w-3.5 h-3.5 flex items-center justify-center">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-40 animate-ping" />
                  <div className="w-2 h-2 rounded-full border border-yellow-400 bg-gray-600 z-10" />
                </div>
                <span className="text-gray-300 text-[11px]">Recent (past 90 days)</span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full border border-green-400 bg-green-400/20 ring-2 ring-green-400/50 flex items-center justify-center">
                  <Route size={9} className="text-green-300" />
                </div>
                <span className="text-gray-300 text-[11px]">Active Route Corridor Threat</span>
              </div>

              <div className="h-px bg-gray-800 my-0.5" />

              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-1.5 rounded-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 ring-2 ring-gray-950" />
                <span className="text-gray-300 text-[11px]">Selected route (color = corridor risk)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-1.5 rounded-full bg-slate-400" />
                <span className="text-gray-300 text-[11px]">Alternative route (click to select)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full border border-green-500/70 bg-green-500/10" />
                <span className="text-gray-300 text-[11px]">Hub area: incidents shown inside</span>
              </div>

              <div className="h-px bg-gray-800 my-0.5" />

              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full bg-green-600 border border-white flex items-center justify-center">
                  <Home className="w-2 h-2 text-white" />
                </div>
                <span className="text-gray-300 text-[11px]">Operational Hub (Safe)</span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500 border border-white flex items-center justify-center">
                  <Home className="w-2 h-2 text-white" />
                </div>
                <span className="text-gray-300 text-[11px]">Hub threatened (incident &le;5 km, past 6 weeks)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerToggle({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors ${
        isActive ? 'bg-green-600/15 hover:bg-green-600/25' : 'hover:bg-gray-800/70'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span className={`text-xs ${isActive ? 'text-green-100 font-medium' : 'text-gray-400'}`}>
          {label}
        </span>
      </div>
      <div className={`w-8 h-4 rounded-full transition-colors relative flex items-center px-0.5 ${isActive ? 'bg-green-600' : 'bg-gray-700'}`}>
        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
    </button>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-2.5 h-2.5 rounded-full ${color} shadow-[0_0_6px_rgba(0,0,0,0.5)]`} />
      <span className="text-gray-300 text-[11px]">{label}</span>
    </div>
  );
}
