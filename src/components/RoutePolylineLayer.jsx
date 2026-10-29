import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Renders primary and alternative route polylines on Google Maps.
 */
export default function RoutePolylineLayer({
  routes = [],
  selectedRouteIndex = 0,
  onSelectRoute
}) {
  const map = useMap();
  const polylinesRef = useRef([]);

  useEffect(() => {
    if (!map || !window.google?.maps) return;

    // Clear previous polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (!routes || routes.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    routes.forEach((route, index) => {
      const isSelected = index === selectedRouteIndex;
      if (!route.coordinates || route.coordinates.length === 0) return;

      const path = route.coordinates.map(([lng, lat]) => {
        const pt = new window.google.maps.LatLng(lat, lng);
        if (isSelected) {
          bounds.extend(pt);
          hasPoints = true;
        }
        return pt;
      });

      // Primary active route styling vs alternative route styling
      const polyline = new window.google.maps.Polyline({
        path,
        map,
        geodesic: true,
        strokeColor: isSelected ? '#06b6d4' : '#64748b', // Cyan for active, muted slate for alt
        strokeOpacity: isSelected ? 0.95 : 0.6,
        strokeWeight: isSelected ? 6 : 4,
        zIndex: isSelected ? 50 : 20,
        clickable: true
      });

      // Clicking an alternative route selects it
      polyline.addListener('click', () => {
        if (onSelectRoute) {
          onSelectRoute(index);
        }
      });

      polylinesRef.current.push(polyline);
    });

    // Auto-fit map to the selected route bounds
    if (hasPoints) {
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    }

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routes, selectedRouteIndex, onSelectRoute]);

  return null;
}

