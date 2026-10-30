import React from 'react';
import { Home } from 'lucide-react';

export default function HubMarker({ hub, isActive }) {
  const isThreatened = hub.isThreatened;
  const colorClass = isThreatened ? 'bg-red-500' : 'bg-emerald-600';
  const pulseClass = isThreatened ? 'bg-red-400' : 'bg-emerald-400';
  const activeClass = isActive ? 'ring-4 ring-white scale-110 z-30' : 'z-20';

  return (
    <div 
      className={`relative flex flex-col items-center justify-center cursor-pointer select-none transition-transform ${activeClass}`}
    >
      <span className={`text-white bg-black/85 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap mb-1 shadow-lg transition-opacity ${
        isActive ? 'opacity-100 ring-1 ring-white/40' : 'opacity-85'
      }`}>
        {hub.location_name}
      </span>
      <div className="relative flex h-8 w-8 items-center justify-center">
        {isActive && (
          <span className={`animate-ping absolute inline-flex h-12 w-12 rounded-full ${pulseClass} opacity-50 pointer-events-none`} />
        )}
        {isThreatened && !isActive && (
          <span className="animate-pulse absolute inline-flex h-10 w-10 rounded-full bg-red-500 opacity-40 pointer-events-none" />
        )}
        <div className={`relative flex items-center justify-center h-8 w-8 rounded-full ${colorClass} border-2 border-white shadow-xl`}>
          <Home size={16} className="text-white" />
        </div>
      </div>
    </div>
  );
}

