import React, { useMemo } from 'react';
import { AdvancedMarker, AdvancedMarkerAnchorPoint } from '@vis.gl/react-google-maps';
import { Flag, MapPin } from 'lucide-react';
import { pickLabelPositions, riskColor, routeLetter, compareRoutes } from '../utils/routeComparison';

/**
 * On-map route annotations: start/end pins and a clickable label chip on each
 * route alternative (letter, travel time, corridor risk).
 */
export default function RouteMapOverlays({ activeRouteData, selectedRouteIndex = 0, onSelectRoute }) {
  const routes = activeRouteData?.routes;
  const labelPositions = useMemo(() => pickLabelPositions(routes || []), [routes]);
  const { safestIndex, fastestIndex } = useMemo(() => compareRoutes(routes || []), [routes]);

  if (!routes?.length) return null;

  const { origin, destination } = activeRouteData;

  return (
    <>
      {origin && (
        <AdvancedMarker position={{ lat: origin.lat, lng: origin.lng }} anchorPoint={AdvancedMarkerAnchorPoint.TOP_CENTER} zIndex={60} title={`Start: ${origin.label}`}>
          <EndpointPin label="Start" sublabel={origin.label} icon={<MapPin size={14} />} className="bg-white text-gray-900" />
        </AdvancedMarker>
      )}
      {destination && (
        <AdvancedMarker position={{ lat: destination.lat, lng: destination.lng }} anchorPoint={AdvancedMarkerAnchorPoint.TOP_CENTER} zIndex={60} title={`Destination: ${destination.label}`}>
          <EndpointPin label="End" sublabel={destination.label} icon={<Flag size={14} />} className="bg-gray-900 text-white border border-white" />
        </AdvancedMarker>
      )}

      {routes.map((route, index) => {
        const pos = labelPositions[index];
        if (!pos) return null;
        const isSelected = index === selectedRouteIndex;
        const level = route.exposure?.riskLevel;
        const color = riskColor(level);
        const tag = routes.length > 1
          ? [index === safestIndex && 'Safest', index === fastestIndex && 'Fastest'].filter(Boolean).join(' · ')
          : '';

        return (
          <AdvancedMarker
            key={`route-label-${route.id || index}`}
            position={{ lat: pos[1], lng: pos[0] }}
            zIndex={isSelected ? 70 : 65}
            onClick={() => onSelectRoute?.(index)}
            title={isSelected ? `Route ${routeLetter(index)} (selected)` : `Select route ${routeLetter(index)}`}
          >
            <div
              className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 shadow-xl cursor-pointer transition-transform hover:scale-105 whitespace-nowrap ${
                isSelected
                  ? 'bg-gray-950 text-white ring-2 ring-white'
                  : 'bg-gray-900/90 text-gray-300 border border-gray-600 hover:text-white'
              }`}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-gray-950"
                style={{ backgroundColor: isSelected ? color : '#cbd5e1' }}
              >
                {routeLetter(index)}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-bold">{route.durationText} · {route.distanceText}</span>
                <span className="text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {route.exposure?.totalCount ?? 0} incident{route.exposure?.totalCount === 1 ? '' : 's'} near route
                  {tag && <span className="text-green-300 font-semibold">· {tag}</span>}
                </span>
              </span>
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}

// Anchored at its top dot and hanging below the point, so it doesn't cover the hub label above
function EndpointPin({ label, sublabel, icon, className }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-900" />
      <div className="w-0.5 h-4 bg-white" />
      <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 shadow-xl text-xs font-bold whitespace-nowrap ${className}`}>
        {icon}
        <span>{label}</span>
        {sublabel && <span className="font-normal opacity-75 max-w-[140px] truncate">{sublabel}</span>}
      </div>
    </div>
  );
}
