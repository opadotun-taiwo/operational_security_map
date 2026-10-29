import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Draws geodesic buffer circles for operational hubs or selected focus points.
 */
export default function ProximityCircleLayer({
  activeHubObj,
  enabled = true,
  radiusMeters = 5000
}) {
  const map = useMap();
  const circleRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google?.maps) return;

    if (!enabled || !activeHubObj) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    const lat = parseFloat(activeHubObj.latitude);
    const lng = parseFloat(activeHubObj.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    const center = new window.google.maps.LatLng(lat, lng);

    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({
        map,
        center,
        radius: radiusMeters,
        fillColor: '#eab308',
        fillOpacity: 0.15,
        strokeColor: '#ca8a04',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        zIndex: 10
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(radiusMeters);
      circleRef.current.setMap(map);
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, activeHubObj, enabled, radiusMeters]);

  return null;
}

