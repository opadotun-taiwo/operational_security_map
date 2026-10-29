import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * HeatmapLayer component using Google Maps Visualization library.
 */
export default function HeatmapLayer({ 
  events = [], 
  enabled = true, 
  timeHorizon = 'all', // 'all', '90d', '30d'
  weightedBySeverity = true 
}) {
  const map = useMap();
  const heatmapRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google?.maps?.visualization) {
      return;
    }

    if (!enabled || events.length === 0) {
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
      }
      return;
    }

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    const filteredEvents = events.filter(e => {
      if (timeHorizon === 'all') return true;
      if (!e.date) return false;
      const eventTime = new Date(e.date).getTime();
      const age = now - eventTime;
      if (timeHorizon === '30d') return age <= thirtyDaysMs;
      if (timeHorizon === '90d') return age <= ninetyDaysMs;
      return true;
    });

    const data = filteredEvents.map(event => {
      const lat = parseFloat(event.latitude);
      const lng = parseFloat(event.longitude);
      if (isNaN(lat) || isNaN(lng)) return null;

      const location = new window.google.maps.LatLng(lat, lng);

      if (!weightedBySeverity) {
        return location;
      }

      let weight = 1;
      const severity = (event.severity || '').toLowerCase();
      if (severity === 'critical') weight = 4.0;
      else if (severity === 'high') weight = 2.5;
      else if (severity === 'medium') weight = 1.5;

      // Casualties also add slight weight
      if (event.fatalities) weight += Math.min(event.fatalities * 0.2, 2);

      return {
        location,
        weight
      };
    }).filter(Boolean);

    if (!heatmapRef.current) {
      heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
        data,
        map,
        radius: 35,
        opacity: 0.75,
        gradient: [
          'rgba(0, 0, 0, 0)',
          'rgba(59, 130, 246, 0.6)', // blue
          'rgba(16, 185, 129, 0.7)', // emerald
          'rgba(234, 179, 8, 0.85)', // yellow
          'rgba(249, 115, 22, 0.95)', // orange
          'rgba(239, 68, 68, 1)' // red
        ]
      });
    } else {
      heatmapRef.current.setData(data);
      heatmapRef.current.setMap(map);
    }

    return () => {
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
      }
    };
  }, [map, events, enabled, timeHorizon, weightedBySeverity]);

  return null;
}

