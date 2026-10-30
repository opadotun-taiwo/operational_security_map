import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Draws a faint ring around every hub showing the operating area whose incidents
 * are displayed, so users can see why incidents outside it are hidden.
 */
export default function HubAreaLayer({ hubs = [], radiusKm, enabled = true }) {
  const map = useMap();
  const circlesRef = useRef([]);

  useEffect(() => {
    if (!map || !window.google?.maps) return;

    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    if (!enabled || typeof radiusKm !== 'number') return;

    for (const hub of hubs) {
      const lat = parseFloat(hub.latitude);
      const lng = parseFloat(hub.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;

      circlesRef.current.push(new window.google.maps.Circle({
        map,
        center: { lat, lng },
        radius: radiusKm * 1000,
        fillColor: '#22c55e',
        fillOpacity: 0.05,
        strokeColor: '#22c55e',
        strokeOpacity: 0.45,
        strokeWeight: 1,
        clickable: false,
        zIndex: 5
      }));
    }

    return () => {
      circlesRef.current.forEach(c => c.setMap(null));
      circlesRef.current = [];
    };
  }, [map, hubs, radiusKm, enabled]);

  return null;
}
