import React, { useMemo, useState, useRef, useEffect } from 'react';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl/mapbox';
import { Home } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';
import useSupercluster from 'use-supercluster';
import MapLayerControls from './MapLayerControls';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const CustomMarker = ({ event, onClick, activeHubObj }) => {
  const isCritical = event.severity?.toLowerCase() === 'critical';
  const isHigh = event.severity?.toLowerCase() === 'high';
  
  const isRecent = event.date && (Date.now() - new Date(event.date).getTime()) <= 7 * 24 * 60 * 60 * 1000;
  
  let colorClass = 'bg-blue-500';
  if (isCritical) colorClass = 'bg-red-500';
  else if (isHigh) colorClass = 'bg-orange-500';

  const isHighlighted = useMemo(() => {
    if (!activeHubObj) return false;
    const pt1 = turf.point([parseFloat(event.longitude), parseFloat(event.latitude)]);
    const pt2 = turf.point([parseFloat(activeHubObj.longitude), parseFloat(activeHubObj.latitude)]);
    return turf.distance(pt1, pt2, { units: 'kilometers' }) <= 5;
  }, [activeHubObj, event.latitude, event.longitude]);

  const highlightClass = isHighlighted ? 'ring-4 ring-yellow-400 scale-125 z-30' : '';
  const recentClass = isRecent ? 'animate-bounce border-yellow-400' : 'border-white';

  return (
    <div 
      className={`relative flex items-center justify-center cursor-pointer group ${isHighlighted ? 'z-30' : 'z-10'}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
    >
      {isRecent && (
        <span className="absolute inline-flex h-6 w-6 rounded-full bg-yellow-400 opacity-40 animate-ping"></span>
      )}
      <div className={`w-3 h-3 rounded-full border shadow-lg ${colorClass} ${recentClass} ${highlightClass} transition-all duration-300 group-hover:scale-150`}></div>
    </div>
  );
};

const HubMarker = ({ hub, isActive }) => {
  const isThreatened = hub.isThreatened;
  const colorClass = isThreatened ? 'bg-red-500' : 'bg-green-500';
  const pulseClass = isThreatened ? 'bg-red-400' : 'bg-green-400';
  const activeClass = isActive ? 'ring-4 ring-white scale-110 z-20' : '';

  return (
    <div className={`relative flex flex-col items-center justify-center pointer-events-none mt-6 transition-transform ${activeClass}`}>
      <span className={`text-white bg-black/80 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap mb-1 shadow-lg transition-opacity ${isActive ? 'opacity-100' : 'opacity-80'}`}>
        {hub.location_name}
      </span>
      <div className="relative flex h-8 w-8 items-center justify-center">
        {isActive && (
           <span className={`animate-ping absolute inline-flex h-12 w-12 rounded-full ${pulseClass} opacity-50`}></span>
        )}
        <div className={`relative flex items-center justify-center h-8 w-8 rounded-full ${colorClass} border-2 border-white shadow-lg`}>
          <Home size={16} className="text-white" />
        </div>
      </div>
    </div>
  );
};

export default function MapArea({ events, hubs, onEventClick, onClusterClick, mapLayers, setMapLayers, activeHub, setActiveHub }) {
  const mapRef = useRef();
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(5);
  const [mapLoaded, setMapLoaded] = useState(false);

  const initialViewState = {
    longitude: 8.6753,
    latitude: 9.0820,
    zoom: 5
  };

  const handleZoomOut = () => {
    mapRef.current?.flyTo({
      center: [initialViewState.longitude, initialViewState.latitude],
      zoom: initialViewState.zoom,
      duration: 800
    });
  };

  const handleMapMove = () => {
    if (mapRef.current) {
      const b = mapRef.current.getMap().getBounds().toArray().flat();
      setBounds(b);
      setZoom(mapRef.current.getMap().getZoom());
    }
  };

  const points = useMemo(() => {
    return events.map(event => ({
      type: "Feature",
      properties: { cluster: false, eventId: event.event_id || event.id, category: 'event', event },
      geometry: {
        type: "Point",
        coordinates: [parseFloat(event.longitude), parseFloat(event.latitude)]
      }
    })).filter(p => !isNaN(p.geometry.coordinates[0]) && !isNaN(p.geometry.coordinates[1]));
  }, [events]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds,
    zoom,
    options: { radius: 40, maxZoom: 20 }
  });

  const activeHubObj = useMemo(() => hubs.find(h => h.id === activeHub), [hubs, activeHub]);

  const incidentMarkers = mapLayers?.incidents ? clusters.map(cluster => {
    const [longitude, latitude] = cluster.geometry.coordinates;
    const { cluster: isCluster, point_count: pointCount } = cluster.properties;

    if (isCluster) {
      return (
        <Marker key={`cluster-${cluster.id}`} latitude={latitude} longitude={longitude}>
          <div
            className="flex items-center justify-center bg-green-600/90 text-white rounded-full border border-white shadow-xl cursor-pointer hover:bg-green-500 transition-colors tutorial-step-2"
            style={{
              width: `${Math.min(40 + (pointCount / points.length) * 40, 80)}px`,
              height: `${Math.min(40 + (pointCount / points.length) * 40, 80)}px`
            }}
            onClick={(e) => {
              e.stopPropagation();
              const leaves = supercluster.getLeaves(cluster.id, Infinity).map(l => l.properties.event);
              if (onClusterClick) onClusterClick(leaves);
            }}
          >
            <span className="font-bold text-sm">{pointCount}</span>
          </div>
        </Marker>
      );
    }

    return (
      <Marker
        key={`event-${cluster.properties.eventId}`}
        longitude={longitude}
        latitude={latitude}
        anchor="center"
      >
        <CustomMarker event={cluster.properties.event} onClick={onEventClick} activeHubObj={activeHubObj} />
      </Marker>
    );
  }) : null;

  const hubMarkers = mapLayers?.hubs ? hubs.map((hub) => {
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
        <div 
          onMouseEnter={() => setActiveHub(hub.id)}
          onMouseLeave={() => setActiveHub(null)}
          className="cursor-pointer"
        >
          <HubMarker hub={hub} isActive={activeHub === hub.id} />
        </div>
      </Marker>
    );
  }) : null;

  const bufferGeoJSON = useMemo(() => {
    if (!mapLayers?.proximity || !activeHubObj) return turf.featureCollection([]);
    
    const lat = parseFloat(activeHubObj.latitude);
    const lng = parseFloat(activeHubObj.longitude);
    if (isNaN(lat) || isNaN(lng)) return turf.featureCollection([]);

    const pt = turf.point([lng, lat]);
    const buffer = turf.buffer(pt, 5, { units: 'kilometers' });
    return turf.featureCollection([buffer]);
  }, [activeHubObj, mapLayers?.proximity]);

  const heatmapGeoJSON = useMemo(() => {
    if (!mapLayers?.hotspots) return turf.featureCollection([]);
    return turf.featureCollection(points);
  }, [points, mapLayers?.hotspots]);

  return (
    <div className="flex-1 h-screen relative bg-gray-900 z-10">
      {mapLayers && setMapLayers && (
        <MapLayerControls mapLayers={mapLayers} setMapLayers={setMapLayers} />
      )}

      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={[]}
        onMove={handleMapMove}
        onLoad={(e) => {
          setMapLoaded(true);
          handleMapMove();
        }}
      >
        <button
          onClick={handleZoomOut}
          className="absolute bottom-8 left-4 z-20 bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-lg border border-gray-800 text-white shadow-xl hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-2 tutorial-step-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Reset View
        </button>

        <NavigationControl position="bottom-right" />
        
        {/* Proximity Buffer Layer */}
        {mapLoaded && bufferGeoJSON.features.length > 0 && (
          <Source id="active-buffer" type="geojson" data={bufferGeoJSON}>
            <Layer 
              id="active-buffer-fill"
              type="fill"
              paint={{
                'fill-color': '#eab308',
                'fill-opacity': 0.15,
                'fill-outline-color': '#ca8a04'
              }}
            />
            <Layer 
              id="active-buffer-outline"
              type="line"
              paint={{
                'line-color': '#ca8a04',
                'line-width': 2,
                'line-dasharray': [2, 2]
              }}
            />
          </Source>
        )}

        {/* Heatmap Layer */}
        {mapLoaded && mapLayers?.hotspots && heatmapGeoJSON.features.length > 0 && (
          <Source id="heatmap" type="geojson" data={heatmapGeoJSON}>
            <Layer 
              id="heatmap-layer"
              type="heatmap"
              paint={{
                'heatmap-weight': 1,
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 'rgba(0,0,0,0)',
                  0.2, '#2563eb', // blue
                  0.4, '#b91c1c', // red
                  0.6, '#ea580c', // orange
                  0.8, '#eab308', // yellow
                  1, '#fef08a' // light yellow
                ],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 40],
                'heatmap-opacity': 0.8
              }}
            />
          </Source>
        )}

        {hubMarkers}
        {incidentMarkers}
      </Map>
    </div>
  );
}
