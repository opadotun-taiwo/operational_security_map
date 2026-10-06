import React from 'react';
import { Layers, MapPin, Home, Activity, Flame, ShieldAlert } from 'lucide-react';

export default function MapLayerControls({ mapLayers, setMapLayers }) {
  const [isOpen, setIsOpen] = React.useState(true);
  
  const toggleLayer = (layer) => {
    setMapLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-4 w-64 items-end">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-900/90 backdrop-blur-md rounded-xl p-3 border border-gray-800 shadow-xl text-white hover:bg-gray-800 transition-colors flex items-center justify-center tutorial-step-3"
        title={isOpen ? "Collapse Controls" : "Expand Controls"}
      >
        <Layers className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          {/* Layer Controls */}
          <div className="bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-800 shadow-xl overflow-hidden w-full">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-gray-400" />
              <h3 className="font-semibold text-white">Map Layers</h3>
            </div>
        <div className="p-2 flex flex-col gap-1">
          <LayerToggle 
            icon={<MapPin className="w-4 h-4 text-blue-400" />}
            label="Security Incidents" 
            isActive={mapLayers.incidents} 
            onClick={() => toggleLayer('incidents')} 
          />
          <LayerToggle 
            icon={<Home className="w-4 h-4 text-green-400" />}
            label="Operational Hubs" 
            isActive={mapLayers.hubs} 
            onClick={() => toggleLayer('hubs')} 
          />
          <LayerToggle 
            icon={<ShieldAlert className="w-4 h-4 text-yellow-400" />}
            label="Proximity Zones (5km)" 
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
      </div>

      {/* Legend */}
      <div className="bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-800 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-white">Legend</h3>
        </div>
        <div className="p-4 flex flex-col gap-3 text-sm">
          <LegendItem color="bg-red-500" label="Critical Severity" />
          <LegendItem color="bg-orange-500" label="High Severity" />
          <LegendItem color="bg-blue-500" label="Medium/Low Severity" />
          <div className="flex items-center gap-3 mt-1">
            <div className="relative w-4 h-4 flex items-center justify-center">
               <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-40 animate-ping"></span>
               <div className="w-2.5 h-2.5 rounded-full border border-yellow-400 bg-gray-500 z-10"></div>
            </div>
            <span className="text-gray-300">Recent (Last 7 Days)</span>
          </div>
          <div className="h-px bg-gray-800 my-1"></div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-green-500 border border-white flex items-center justify-center">
               <Home className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-gray-300">Safe Hub</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-red-500 border border-white flex items-center justify-center">
               <Home className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-gray-300">Threatened Hub</span>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function LayerToggle({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg transition-colors ${
        isActive ? 'bg-blue-600/10 hover:bg-blue-600/20' : 'hover:bg-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className={`text-sm ${isActive ? 'text-blue-100 font-medium' : 'text-gray-400'}`}>
          {label}
        </span>
      </div>
      <div className={`w-10 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${isActive ? 'bg-blue-500' : 'bg-gray-700'}`}>
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </button>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full ${color} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
      <span className="text-gray-300">{label}</span>
    </div>
  );
}
