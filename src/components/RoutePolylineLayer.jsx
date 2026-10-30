import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { ALTERNATIVE_ROUTE_COLOR, riskColor } from '../utils/routeComparison';

/**
 * Renders route alternatives on Google Maps. The selected route is drawn on top in its
 * corridor risk color with a dark casing; alternatives are muted grey lines that
 * highlight on hover and become the selected route when clicked.
 */
export default function RoutePolylineLayer({
  routes = [],
  selectedRouteIndex = 0,
  onSelectRoute
}) {
  const map = useMap();
  const polylinesRef = useRef([]);
  const fittedKeyRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const { maps } = window.google;

    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (!routes || routes.length === 0) return;

    const bounds = new maps.LatLngBounds();
    let hasPoints = false;

    // Draw alternatives first so the selected route always sits on top
    const order = routes.map((_, i) => i).sort((a, b) => (a === selectedRouteIndex) - (b === selectedRouteIndex));

    for (const index of order) {
      const route = routes[index];
      if (!route.coordinates || route.coordinates.length === 0) continue;
      const isSelected = index === selectedRouteIndex;

      const path = route.coordinates.map(([lng, lat]) => {
        const pt = new maps.LatLng(lat, lng);
        bounds.extend(pt);
        hasPoints = true;
        return pt;
      });

      if (isSelected) {
        // Casing gives the selected route contrast against roads and alternatives
        polylinesRef.current.push(new maps.Polyline({
          path,
          map,
          strokeColor: '#020617',
          strokeOpacity: 0.9,
          strokeWeight: 10,
          zIndex: 49,
          clickable: false
        }));
        polylinesRef.current.push(new maps.Polyline({
          path,
          map,
          strokeColor: riskColor(route.exposure?.riskLevel),
          strokeOpacity: 1,
          strokeWeight: 6,
          zIndex: 50,
          clickable: false
        }));
        continue;
      }

      const alternative = new maps.Polyline({
        path,
        map,
        strokeColor: ALTERNATIVE_ROUTE_COLOR,
        strokeOpacity: 0.75,
        strokeWeight: 5,
        zIndex: 20 + index,
        clickable: true
      });
      alternative.addListener('mouseover', () => alternative.setOptions({ strokeColor: '#e2e8f0', strokeOpacity: 1, strokeWeight: 7 }));
      alternative.addListener('mouseout', () => alternative.setOptions({ strokeColor: ALTERNATIVE_ROUTE_COLOR, strokeOpacity: 0.75, strokeWeight: 5 }));
      alternative.addListener('click', () => onSelectRoute?.(index));
      polylinesRef.current.push(alternative);
    }

    // Fit the map once per newly calculated trip, not when the user switches routes
    const tripKey = routes.map(r => `${r.id}:${r.coordinates?.length}`).join('|');
    if (hasPoints && fittedKeyRef.current !== tripKey) {
      fittedKeyRef.current = tripKey;
      // Leave room for the route panel (left) and layer controls (right) on wide screens
      const wide = map.getDiv().offsetWidth >= 1000;
      map.fitBounds(bounds, wide ? { top: 80, right: 320, bottom: 80, left: 460 } : 40);
    }

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routes, selectedRouteIndex, onSelectRoute]);

  return null;
}
