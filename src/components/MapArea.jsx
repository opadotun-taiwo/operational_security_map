import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  useMap 
} from '@vis.gl/react-google-maps';
import useSupercluster from 'use-supercluster';
import { RotateCcw, AlertCircle, X } from 'lucide-react';
import IncidentMarker from './IncidentMarker';
import HubMarker from './HubMarker';
import RoutePolylineLayer from './RoutePolylineLayer';
import ProximityCircleLayer from './ProximityCircleLayer';
import HeatmapLayer from './HeatmapLayer';
import HubAreaLayer from './HubAreaLayer';
import RouteMapOverlays from './RouteMapOverlays';
import MapLayerControls from './MapLayerControls';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCSl0cp_JRq0RiSbxh0WCUYS1OzKnZCeK4';
// AdvancedMarker (hubs, incidents, clusters) only renders on a map with a Map ID.
// DEMO_MAP_ID is Google's public test ID; set VITE_GOOGLE_MAP_ID to a custom one for production.
const GOOGLE_MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

const INITIAL_CENTER = { lat: 9.0820, lng: 8.6753 }; // Nigeria center
const INITIAL_ZOOM = 6;
// Closest zoom used when opening a cluster (keeps context when incidents share a spot)
const MAX_CLUSTER_ZOOM = 15;

/**
 * Inner Map Content component having access to `useMap()`.
 */
function MapContent({
  events,
  hubs,
  hubRadiusKm,
  onEventClick,
  onClusterClick,
  mapLayers,
  setMapLayers,
  activeHub,
  setActiveHub,
  activeRouteData,
  selectedRouteIndex,
  onSelectRouteIndex,
  hotspotSettings,
  setHotspotSettings,
  isPickingLocation = false,
  onPickLocation,
  pickedLocation,
  focusRequest
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  // A clicked cluster is "exploded": its incidents are drawn individually at their own
  // locations until the user regroups them or zooms back out.
  const [expanded, setExpanded] = useState(null); // { ids: Set, minZoom: number | null }
  const expandedRef = useRef(null);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  // Sync bounds and zoom on map idle
  React.useEffect(() => {
    if (!map || !window.google?.maps) return;

    const updateBoundsAndZoom = () => {
      const b = map.getBounds();
      if (b) {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        setBounds([sw.lng(), sw.lat(), ne.lng(), ne.lat()]);
      }
      const z = map.getZoom();
      if (typeof z === 'number') {
        setZoom(z);
        const minZoom = expandedRef.current?.minZoom;
        if (typeof minZoom === 'number' && z < minZoom) setExpanded(null);
      }
    };

    updateBoundsAndZoom();
    const listener = map.addListener('idle', updateBoundsAndZoom);
    return () => {
      window.google.maps.event.removeListener(listener);
    };
  }, [map]);

  // Report form: clicking the map sets the incident location
  useEffect(() => {
    if (!map || !isPickingLocation || !window.google?.maps) return undefined;
    map.setOptions({ draggableCursor: 'crosshair' });
    const listener = map.addListener('click', (e) => {
      if (e.latLng) onPickLocation?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => {
      window.google.maps.event.removeListener(listener);
      map.setOptions({ draggableCursor: null });
    };
  }, [map, isPickingLocation, onPickLocation]);

  // Fly to a newly reported incident
  useEffect(() => {
    if (!map || !focusRequest || isNaN(focusRequest.lat) || isNaN(focusRequest.lng)) return;
    map.panTo({ lat: focusRequest.lat, lng: focusRequest.lng });
    if ((map.getZoom() ?? 0) < 11) map.setZoom(11);
  }, [map, focusRequest]);

  const handleResetView = () => {
    setExpanded(null);
    if (map) {
      map.panTo(INITIAL_CENTER);
      map.setZoom(INITIAL_ZOOM);
    }
  };

  const activeHubObj = useMemo(() => 
    hubs.find(h => h.id === activeHub), 
    [hubs, activeHub]
  );

  // Map of incidents within current active route corridor for highlighting
  const { corridorIncidentIds, corridorIncidentMap } = useMemo(() => {
    const ids = new Set();
    const mapObj = {};
    const selectedRoute = activeRouteData?.routes?.[selectedRouteIndex];
    if (selectedRoute?.exposure?.corridorIncidents) {
      for (const inc of selectedRoute.exposure.corridorIncidents) {
        const id = inc.event_id || inc.id;
        ids.add(id);
        mapObj[id] = inc;
      }
    }
    return { corridorIncidentIds: ids, corridorIncidentMap: mapObj };
  }, [activeRouteData, selectedRouteIndex]);

  // Exploded incidents still present after filtering, fanned out when they share a location
  const expandedMarkers = useMemo(() => {
    if (!expanded) return [];
    return spreadOverlapping(events.filter(e => expanded.ids.has(e.event_id || e.id)));
  }, [events, expanded]);
  const expandedIds = useMemo(
    () => new Set(expandedMarkers.map(m => m.event.event_id || m.event.id)),
    [expandedMarkers]
  );

  // Prepare GeoJSON points for Supercluster (exploded incidents are drawn separately)
  const points = useMemo(() => {
    return events.filter(event => !expandedIds.has(event.event_id || event.id)).map(event => ({
      type: 'Feature',
      properties: { 
        cluster: false, 
        eventId: event.event_id || event.id, 
        category: 'event', 
        event 
      },
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(event.longitude), parseFloat(event.latitude)]
      }
    })).filter(p => !isNaN(p.geometry.coordinates[0]) && !isNaN(p.geometry.coordinates[1]));
  }, [events, expandedIds]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds,
    zoom: Math.round(zoom),
    options: { radius: 60, maxZoom: 16 }
  });

  // Zoom to a cluster's incidents and show each one individually at its location
  const handleClusterClick = (clusterId) => {
    if (!supercluster) return;
    const leaves = supercluster.getLeaves(clusterId, Infinity).map(l => l.properties.event);
    const ids = new Set(leaves.map(e => e.event_id || e.id));
    setExpanded(prev => ({
      ids: prev ? new Set([...prev.ids, ...ids]) : ids,
      minZoom: null
    }));

    if (!map || !window.google?.maps) return;
    const clusterBounds = new window.google.maps.LatLngBounds();
    leaves.forEach(e => clusterBounds.extend({ lat: parseFloat(e.latitude), lng: parseFloat(e.longitude) }));
    map.fitBounds(clusterBounds, 90);
    window.google.maps.event.addListenerOnce(map, 'idle', () => {
      // Incidents at (nearly) one spot would otherwise zoom to street level
      if ((map.getZoom() ?? 0) > MAX_CLUSTER_ZOOM) map.setZoom(MAX_CLUSTER_ZOOM);
      // Zooming out well past this view regroups them
      const settled = Math.min(map.getZoom() ?? MAX_CLUSTER_ZOOM, MAX_CLUSTER_ZOOM);
      setExpanded(prev => (prev ? { ...prev, minZoom: settled - 2 } : prev));
    });
  };

  const renderIncidentMarker = (currentEvent, latitude, longitude, offset) => {
    const eventId = currentEvent.event_id || currentEvent.id;
    const isInCorridor = corridorIncidentIds.has(eventId);
    const corridorInfo = corridorIncidentMap[eventId];

    return (
      <AdvancedMarker
        key={`event-${eventId}`}
        position={{ lat: latitude, lng: longitude }}
        zIndex={isInCorridor ? 40 : 22}
        onClick={() => onEventClick?.(currentEvent)}
      >
        <div style={offset ? { transform: `translate(${offset[0]}px, ${offset[1]}px)` } : undefined}>
          <IncidentMarker 
            event={currentEvent} 
            activeHubObj={activeHubObj}
            isInRouteCorridor={isInCorridor}
            distanceToRouteKm={corridorInfo?.distanceToRouteKm}
          />
        </div>
      </AdvancedMarker>
    );
  };

  return (
    <>
      {/* Map Layer Controls Panel */}
      {mapLayers && setMapLayers && (
        <MapLayerControls 
          mapLayers={mapLayers} 
          setMapLayers={setMapLayers}
          hotspotSettings={hotspotSettings}
          setHotspotSettings={setHotspotSettings}
          hubRadiusKm={hubRadiusKm}
        />
      )}

      {/* Reset View Button */}
      <button
        onClick={handleResetView}
        className="absolute bottom-8 left-4 z-20 bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-gray-800 text-white shadow-xl hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-2 tutorial-step-4"
        title="Reset map view to default Nigeria center"
      >
        <RotateCcw className="w-4 h-4 text-green-400" />
        Reset View
      </button>

      {/* Hub operating-area rings (the area whose incidents are shown) */}
      <HubAreaLayer
        hubs={hubs}
        radiusKm={hubRadiusKm}
        enabled={Boolean(mapLayers?.proximity) && Boolean(mapLayers?.hubs)}
      />

      {/* Proximity Buffer Circle Layer */}
      <ProximityCircleLayer
        activeHubObj={activeHubObj}
        enabled={Boolean(mapLayers?.proximity)}
        radiusMeters={5000}
      />

      {/* Heatmap Layer */}
      <HeatmapLayer
        events={events}
        enabled={Boolean(mapLayers?.hotspots)}
        timeHorizon={hotspotSettings?.timeHorizon || 'all'}
        weightedBySeverity={hotspotSettings?.weightedBySeverity ?? true}
      />

      {/* Route Polylines */}
      {activeRouteData?.routes && activeRouteData.routes.length > 0 && (
        <RoutePolylineLayer
          routes={activeRouteData.routes}
          selectedRouteIndex={selectedRouteIndex}
          onSelectRoute={onSelectRouteIndex}
        />
      )}
      <RouteMapOverlays
        activeRouteData={activeRouteData}
        selectedRouteIndex={selectedRouteIndex}
        onSelectRoute={onSelectRouteIndex}
      />

      {/* Operational Hub Markers */}
      {mapLayers?.hubs && hubs.map((hub) => {
        const lat = parseFloat(hub.latitude);
        const lng = parseFloat(hub.longitude);
        if (isNaN(lat) || isNaN(lng)) return null;

        return (
          <AdvancedMarker
            key={`hub-${hub.id}`}
            position={{ lat, lng }}
            zIndex={activeHub === hub.id ? 30 : 20}
            onClick={() => setActiveHub(activeHub === hub.id ? null : hub.id)}
            title={`${hub.location_name || 'Hub'}: click to ${activeHub === hub.id ? 'hide' : 'show'} its 5 km alert zone`}
          >
            <HubMarker hub={hub} isActive={activeHub === hub.id} />
          </AdvancedMarker>
        );
      })}

      {/* Incident Markers & Clusters */}
      {mapLayers?.incidents && clusters.map((cluster) => {
        const [longitude, latitude] = cluster.geometry.coordinates;
        const { cluster: isCluster, point_count: pointCount } = cluster.properties;

        if (isCluster) {
          const size = Math.min(28 + Math.log2(pointCount) * 5, 52);
          return (
            <AdvancedMarker
              key={`cluster-${cluster.id}`}
              position={{ lat: latitude, lng: longitude }}
              zIndex={25}
              onClick={() => handleClusterClick(cluster.id)}
              title={`${pointCount} incidents here. Click to zoom in and see each one.`}
            >
              <div
                className="flex items-center justify-center bg-green-700/90 text-white rounded-full border-2 border-white shadow-2xl cursor-pointer hover:bg-green-600 hover:scale-110 transition-all"
                style={{
                  width: `${size}px`,
                  height: `${size}px`
                }}
              >
                <span className="font-bold text-xs">{pointCount}</span>
              </div>
            </AdvancedMarker>
          );
        }

        return renderIncidentMarker(cluster.properties.event, latitude, longitude);
      })}

      {/* Location chosen in the report form */}
      {pickedLocation && (
        <AdvancedMarker position={pickedLocation} zIndex={80} title="New incident location">
          <div className="flex flex-col items-center">
            <span className="bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap">New report</span>
            <div className="w-0.5 h-3 bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-lg" />
          </div>
        </AdvancedMarker>
      )}

      {isPickingLocation && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-yellow-500 text-gray-950 text-sm font-semibold px-4 py-2 rounded-full shadow-2xl whitespace-nowrap pointer-events-none">
          Click the map where the incident happened
        </div>
      )}

      {/* Incidents from an exploded cluster, each at its own location */}
      {mapLayers?.incidents && expandedMarkers.map(({ event, offset }) =>
        renderIncidentMarker(event, parseFloat(event.latitude), parseFloat(event.longitude), offset)
      )}

      {expandedMarkers.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-full shadow-2xl pl-4 pr-1.5 py-1.5 text-xs text-white whitespace-nowrap">
          <span>
            Showing <span className="font-bold">{expandedMarkers.length}</span> incident{expandedMarkers.length === 1 ? '' : 's'} at their exact locations
          </span>
          <button
            onClick={() => onClusterClick?.(expandedMarkers.map(m => m.event))}
            className="ml-2 px-2.5 py-1 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 font-medium"
          >
            View as list
          </button>
          <button
            onClick={() => setExpanded(null)}
            className="px-2.5 py-1 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 font-medium flex items-center gap-1"
            title="Group these incidents back into clusters"
          >
            <X size={12} /> Regroup
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Incidents recorded at the same coordinates would sit exactly on top of each other;
 * fan them out in a small circle (in pixels) so every one can be seen and clicked.
 */
function spreadOverlapping(incidents) {
  // Plain object: `Map` in this file is the Google Maps component
  const groups = {};
  for (const event of incidents) {
    const lat = parseFloat(event.latitude);
    const lng = parseFloat(event.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    (groups[key] ||= []).push(event);
  }

  const result = [];
  for (const group of Object.values(groups)) {
    if (group.length === 1) {
      result.push({ event: group[0], offset: null });
      continue;
    }
    const radius = Math.min(14 + group.length * 2, 40);
    group.forEach((event, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      result.push({ event, offset: [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)] });
    });
  }
  return result;
}

/**
 * Main MapArea component wrapped in Google Maps APIProvider.
 */
export default function MapArea({ 
  events, 
  hubs, 
  hubRadiusKm,
  onEventClick, 
  onClusterClick, 
  mapLayers, 
  setMapLayers, 
  activeHub, 
  setActiveHub,
  activeRouteData,
  selectedRouteIndex = 0,
  onSelectRouteIndex,
  hotspotSettings,
  setHotspotSettings,
  isPickingLocation,
  onPickLocation,
  pickedLocation,
  focusRequest
}) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-6">
        <AlertCircle className="w-12 h-12 text-yellow-500 mb-3" />
        <h2 className="text-lg font-bold">Google Maps API Key Missing</h2>
        <p className="text-gray-400 text-sm max-w-md text-center mt-1">
          Please define <code className="text-green-400">VITE_GOOGLE_MAPS_API_KEY</code> in your environment variables.
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-gray-950 z-10 tutorial-map" style={{ backgroundColor: '#111827' }}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'geometry', 'routes']}>
        <Map
          defaultCenter={INITIAL_CENTER}
          defaultZoom={INITIAL_ZOOM}
          mapId={GOOGLE_MAP_ID}
          colorScheme="DARK"
          backgroundColor="#111827"
          disableDefaultUI={false}
          zoomControl={true}
          mapTypeControl={false}
          scaleControl={true}
          streetViewControl={false}
          rotateControl={false}
          fullscreenControl={true}
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%', backgroundColor: '#111827' }}
        >
          <MapContent
            events={events}
            hubs={hubs}
            hubRadiusKm={hubRadiusKm}
            onEventClick={onEventClick}
            onClusterClick={onClusterClick}
            mapLayers={mapLayers}
            setMapLayers={setMapLayers}
            activeHub={activeHub}
            setActiveHub={setActiveHub}
            activeRouteData={activeRouteData}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRouteIndex={onSelectRouteIndex}
            hotspotSettings={hotspotSettings}
            setHotspotSettings={setHotspotSettings}
            isPickingLocation={isPickingLocation}
            onPickLocation={onPickLocation}
            pickedLocation={pickedLocation}
            focusRequest={focusRequest}
          />
        </Map>
      </APIProvider>
    </div>
  );
}
