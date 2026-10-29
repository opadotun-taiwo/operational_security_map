import React, { useMemo, useState } from 'react';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  useMap 
} from '@vis.gl/react-google-maps';
import useSupercluster from 'use-supercluster';
import { RotateCcw, AlertCircle } from 'lucide-react';
import IncidentMarker from './IncidentMarker';
import HubMarker from './HubMarker';
import RoutePolylineLayer from './RoutePolylineLayer';
import ProximityCircleLayer from './ProximityCircleLayer';
import HeatmapLayer from './HeatmapLayer';
import MapLayerControls from './MapLayerControls';
import { darkMapStyles } from '../utils/googleMapStyles';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCSl0cp_JRq0RiSbxh0WCUYS1OzKnZCeK4';
const GOOGLE_MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

const INITIAL_CENTER = { lat: 9.0820, lng: 8.6753 }; // Nigeria center
const INITIAL_ZOOM = 6;

/**
 * Inner Map Content component having access to `useMap()`.
 */
function MapContent({
  events,
  hubs,
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
  setHotspotSettings
}) {
  const map = useMap();
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

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
      }
    };

    updateBoundsAndZoom();
    const listener = map.addListener('idle', updateBoundsAndZoom);
    return () => {
      window.google.maps.event.removeListener(listener);
    };
  }, [map]);

  const handleResetView = () => {
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

  // Prepare GeoJSON points for Supercluster
  const points = useMemo(() => {
    return events.map(event => ({
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
  }, [events]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds,
    zoom: Math.round(zoom),
    options: { radius: 45, maxZoom: 18 }
  });

  return (
    <>
      {/* Map Layer Controls Panel */}
      {mapLayers && setMapLayers && (
        <MapLayerControls 
          mapLayers={mapLayers} 
          setMapLayers={setMapLayers}
          hotspotSettings={hotspotSettings}
          setHotspotSettings={setHotspotSettings}
        />
      )}

      {/* Reset View Button */}
      <button
        onClick={handleResetView}
        className="absolute bottom-8 left-4 z-20 bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-gray-800 text-white shadow-xl hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-2 tutorial-step-4"
        title="Reset map view to default Nigeria center"
      >
        <RotateCcw className="w-4 h-4 text-cyan-400" />
        Reset View
      </button>

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
          >
            <div 
              onMouseEnter={() => setActiveHub(hub.id)}
              onMouseLeave={() => setActiveHub(null)}
            >
              <HubMarker 
                hub={hub} 
                isActive={activeHub === hub.id} 
                onSelect={() => setActiveHub(activeHub === hub.id ? null : hub.id)}
              />
            </div>
          </AdvancedMarker>
        );
      })}

      {/* Incident Markers & Clusters */}
      {mapLayers?.incidents && clusters.map((cluster) => {
        const [longitude, latitude] = cluster.geometry.coordinates;
        const { cluster: isCluster, point_count: pointCount } = cluster.properties;

        if (isCluster) {
          const size = Math.min(36 + (pointCount / points.length) * 44, 72);
          return (
            <AdvancedMarker
              key={`cluster-${cluster.id}`}
              position={{ lat: latitude, lng: longitude }}
              zIndex={25}
            >
              <div
                className="flex items-center justify-center bg-emerald-600/90 text-white rounded-full border-2 border-white shadow-2xl cursor-pointer hover:bg-emerald-500 hover:scale-110 transition-all tutorial-step-2"
                style={{
                  width: `${size}px`,
                  height: `${size}px`
                }}
                onClick={(e) => {
                  e.stopPropagation?.();
                  const leaves = supercluster.getLeaves(cluster.id, Infinity).map(l => l.properties.event);
                  if (onClusterClick) onClusterClick(leaves);

                  // Expand cluster on zoom
                  const expansionZoom = Math.min(
                    supercluster.getClusterExpansionZoom(cluster.id),
                    17
                  );
                  map?.panTo({ lat: latitude, lng: longitude });
                  map?.setZoom(expansionZoom);
                }}
                title={`Cluster of ${pointCount} security incidents. Click to inspect or zoom.`}
              >
                <span className="font-bold text-xs">{pointCount}</span>
              </div>
            </AdvancedMarker>
          );
        }

        const currentEvent = cluster.properties.event;
        const eventId = cluster.properties.eventId;
        const isInCorridor = corridorIncidentIds.has(eventId);
        const corridorInfo = corridorIncidentMap[eventId];

        return (
          <AdvancedMarker
            key={`event-${eventId}`}
            position={{ lat: latitude, lng: longitude }}
            zIndex={isInCorridor ? 40 : 15}
          >
            <IncidentMarker 
              event={currentEvent} 
              onClick={onEventClick} 
              activeHubObj={activeHubObj}
              isInRouteCorridor={isInCorridor}
              distanceToRouteKm={corridorInfo?.distanceToRouteKm}
            />
          </AdvancedMarker>
        );
      })}
    </>
  );
}

/**
 * Main MapArea component wrapped in Google Maps APIProvider.
 */
export default function MapArea({ 
  events, 
  hubs, 
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
  setHotspotSettings
}) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex-1 h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6">
        <AlertCircle className="w-12 h-12 text-yellow-500 mb-3" />
        <h2 className="text-lg font-bold">Google Maps API Key Missing</h2>
        <p className="text-gray-400 text-sm max-w-md text-center mt-1">
          Please define <code className="text-blue-400">VITE_GOOGLE_MAPS_API_KEY</code> in your environment variables.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen relative bg-gray-950 z-10">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'visualization', 'geometry']}>
        <Map
          defaultCenter={INITIAL_CENTER}
          defaultZoom={INITIAL_ZOOM}
          mapId={GOOGLE_MAP_ID}
          styles={darkMapStyles}
          disableDefaultUI={false}
          zoomControl={true}
          mapTypeControl={false}
          scaleControl={true}
          streetViewControl={false}
          rotateControl={false}
          fullscreenControl={true}
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%' }}
        >
          <MapContent
            events={events}
            hubs={hubs}
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
          />
        </Map>
      </APIProvider>
    </div>
  );
}
