import React, { useMemo } from 'react';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';
import * as turf from '@turf/turf';

export default function IncidentMarker({
  event,
  onClick,
  activeHubObj,
  isInRouteCorridor = false,
  distanceToRouteKm = null
}) {
  const isCritical = event.severity?.toLowerCase() === 'critical';
  const isHigh = event.severity?.toLowerCase() === 'high';
  const isVerified = (event.verification_status || '').toLowerCase() === 'verified';

  const isRecent = Boolean(event.isRecent);

  // One Acre Fund Green palette for standard incidents, Red for Critical, Orange for High
  let colorClass = 'bg-emerald-500 border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
  if (isCritical) {
    colorClass = 'bg-red-500 border-red-300 shadow-[0_0_12px_rgba(239,68,68,0.7)]';
  } else if (isHigh) {
    colorClass = 'bg-orange-500 border-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.6)]';
  }

  const isNearActiveHub = useMemo(() => {
    if (!activeHubObj) return false;
    const pt1 = turf.point([parseFloat(event.longitude), parseFloat(event.latitude)]);
    const pt2 = turf.point([parseFloat(activeHubObj.longitude), parseFloat(activeHubObj.latitude)]);
    return turf.distance(pt1, pt2, { units: 'kilometers' }) <= 5;
  }, [activeHubObj, event.latitude, event.longitude]);

  return (
    <div
      className={`relative flex items-center justify-center cursor-pointer group select-none ${
        isInRouteCorridor ? 'z-40' : isNearActiveHub ? 'z-30' : 'z-10'
      }`}
      onClick={(e) => {
        e.stopPropagation?.();
        onClick?.(event);
      }}
      title={`${event.event_type || 'Incident'} (${event.severity || 'Unknown'}) - ${event.location || event.state || ''}`}
    >
      {/* Route Corridor Highlight Ring */}
      {isInRouteCorridor && (
        <span className="absolute -inset-2 rounded-full border-2 border-green-400 bg-green-400/25 animate-pulse pointer-events-none" />
      )}

      {/* Near Active Hub Warning Pulse */}
      {isNearActiveHub && (
        <span className="absolute -inset-2 rounded-full border-2 border-yellow-400 bg-yellow-400/25 animate-ping pointer-events-none" />
      )}

      {/* Recent Incident Ping */}
      {isRecent && !isInRouteCorridor && (
        <span className="absolute inline-flex h-6 w-6 rounded-full bg-yellow-400 opacity-40 animate-ping pointer-events-none" />
      )}

      {/* Main Marker Dot */}
      <div
        className={`w-4 h-4 rounded-full border-2 shadow-lg transition-transform duration-200 group-hover:scale-150 flex items-center justify-center ${colorClass} ${
          isNearActiveHub ? 'ring-4 ring-yellow-400' : ''
        } ${isInRouteCorridor ? 'ring-4 ring-green-400 scale-125' : ''}`}
      >
        {isCritical && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>

      {/* Verification & Route Proximity Badges */}
      <div className="absolute -bottom-2 -right-2 flex items-center pointer-events-none">
        {isVerified ? (
          <span className="bg-emerald-950 text-emerald-400 border border-emerald-500 rounded-full p-0.5 shadow">
            <CheckCircle2 size={10} strokeWidth={3} />
          </span>
        ) : (
          <span className="bg-yellow-950 text-yellow-400 border border-yellow-500 rounded-full p-0.5 shadow">
            <ShieldAlert size={10} strokeWidth={3} />
          </span>
        )}
      </div>

      {/* Tooltip on Hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-50">
        <div className="bg-gray-900/95 text-white text-[11px] px-2.5 py-1.5 rounded-md shadow-xl border border-gray-700 whitespace-nowrap">
          <p className="font-semibold text-gray-200">{event.event_type || 'Security Incident'}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
            <span className={isCritical ? 'text-red-400' : isHigh ? 'text-orange-400' : 'text-emerald-400'}>
              {event.severity}
            </span>
            <span>•</span>
            <span>{isVerified ? 'Verified' : 'Unverified'}</span>
            {distanceToRouteKm !== null && (
              <>
                <span>•</span>
                <span className="text-green-400 font-medium">{distanceToRouteKm}km to route</span>
              </>
            )}
          </div>
        </div>
        <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1 border-r border-b border-gray-700" />
      </div>
    </div>
  );
}
