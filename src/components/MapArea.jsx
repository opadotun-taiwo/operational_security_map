import React, { useMemo } from 'react';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl/mapbox';
import { Home } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const CustomMarker = ({ event, onClick, isGrouped }) => {
  const isCritical = event.severity?.toLowerCase() === 'critical';
  const isHigh = event.severity?.toLowerCase() === 'high';
  
  // Calculate if event is recent (within 7 days)
  const isRecent = event.date && (Date.now() - new Date(event.date).getTime()) <= 7 * 24 * 60 * 60 * 1000;
  
  let colorClass = 'bg-blue-500';
  if (isCritical) colorClass = 'bg-red-500';
  else if (isHigh) colorClass = 'bg-orange-500';

  // Apply the pulsing glow if the event is flagged as near a hub
  const hubPulseClass = event.isNearHub ? 'ring-2 ring-red-500/50' : '';
  
  // Apply a recency animation (ping) and maybe a bright yellow core if it's very recent
  const recentClass = isRecent ? 'animate-bounce border-yellow-400' : 'border-white';

  const sizeClass = isGrouped ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <div 
      className="relative flex items-center justify-center cursor-pointer group"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
    >
      {isRecent && (
        <span className={`absolute inline-flex ${isGrouped ? 'h-5 w-5' : 'h-6 w-6'} rounded-full bg-yellow-400 opacity-40 animate-ping`}></span>
      )}
      <div className={`${sizeClass} rounded-full border shadow-lg ${colorClass} ${recentClass} ${hubPulseClass} transition-transform group-hover:scale-150 z-10`}></div>
    </div>
  );
};

const HubMarker = ({ hub }) => {
  const isThreatened = hub.isThreatened;
  const colorClass = isThreatened ? 'bg-red-500' : 'bg-green-500';
  const pulseClass = isThreatened ? 'bg-red-400' : 'bg-green-400';

  return (
    <div className="relative flex flex-col items-center justify-center pointer-events-none mt-6">
      <span className="text-white bg-black/60 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap mb-1">
        {hub.location_name}
      </span>
      <div className="relative flex h-8 w-8 items-center justify-center">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseClass} opacity-75`}></span>
        <div className={`relative flex items-center justify-center h-8 w-8 rounded-full ${colorClass} border-2 border-white shadow-lg`}>
          <Home size={16} className="text-white" />
        </div>
      </div>
    </div>
  );
};

export default function MapArea({ events, hubs, onEventClick }) {
  const initialViewState = {
    longitude: 8.6753,
    latitude: 9.0820,
    zoom: 5
  };

  const markers = useMemo(() => {
    const groups = {};
    events.forEach((event) => {
      const lat = parseFloat(event.latitude);
      const lng = parseFloat(event.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });

    const allMarkers = [];
    Object.values(groups).forEach(group => {
      const n = group.length;
      group.forEach((event, index) => {
        const lat = parseFloat(event.latitude);
        const lng = parseFloat(event.longitude);
        
        let xOffset = 0;
        let yOffset = 0;
        
        if (n > 1) {
          // Distribute in a circle around the center point
          const radius = Math.max(10, n * 2.5); // Increase radius slightly based on number of items
          const angle = (index / n) * 2 * Math.PI;
          xOffset = Math.cos(angle) * radius;
          yOffset = Math.sin(angle) * radius;
        }

        allMarkers.push(
          <Marker
            key={`event-${event.event_id || event.id}`}
            longitude={lng}
            latitude={lat}
            anchor="center"
            offset={[xOffset, yOffset]}
            style={{ zIndex: n > 1 ? 20 - index : 10 }}
          >
            <CustomMarker event={event} onClick={onEventClick} isGrouped={n > 1} />
          </Marker>
        );
      });
    });
    return allMarkers;
  }, [events, onEventClick]);

  const hubMarkers = useMemo(() => {
    return hubs.map((hub) => {
      const lat = parseFloat(hub.latitude);
      const lng = parseFloat(hub.longitude);

      if (isNaN(lat) || isNaN(lng)) return null;

      return (
        <Marker
          key={`hub-${hub.id}`}
          longitude={lng}
          latitude={lat}
          anchor="center"
        >
          <HubMarker hub={hub} />
        </Marker>
      );
    });
  }, [hubs]);

  // Generate a FeatureCollection of 5km buffer polygons around all hubs
  const bufferGeoJSON = useMemo(() => {
    const features = hubs.map(hub => {
      const lat = parseFloat(hub.latitude);
      const lng = parseFloat(hub.longitude);
      
      if (isNaN(lat) || isNaN(lng)) return null;

      const pt = turf.point([lng, lat]);
      return turf.buffer(pt, 5, { units: 'kilometers' });
    }).filter(Boolean);

    return turf.featureCollection(features);
  }, [hubs]);

  const bufferLayerStyle = {
    id: 'hub-buffers',
    type: 'fill',
    paint: {
      'fill-color': '#22c55e',
      'fill-opacity': 0.15,
      'fill-outline-color': '#16a34a'
    }
  };

  const bufferOutlineStyle = {
    id: 'hub-buffers-outline',
    type: 'line',
    paint: {
      'line-color': '#16a34a',
      'line-width': 1.5,
      'line-dasharray': [2, 2]
    }
  };

  return (
    <div className="flex-1 h-screen relative bg-gray-900 z-10">
      <Map
        initialViewState={initialViewState}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={[]}
      >
        <NavigationControl position="bottom-right" />
        
        {bufferGeoJSON.features.length > 0 && (
          <Source id="buffers" type="geojson" data={bufferGeoJSON}>
            <Layer {...bufferLayerStyle} />
            <Layer {...bufferOutlineStyle} />
          </Source>
        )}

        {hubMarkers}
        {markers}
      </Map>
    </div>
  );
}
