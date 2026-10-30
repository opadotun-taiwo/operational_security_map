import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

const RADIUS_PX = 35;
const OPACITY = 0.75;
const MIN_POINT_ALPHA = 0.15;
const GRADIENT_STOPS = [
  [0.0, 'rgba(0, 0, 0, 0)'],
  [0.2, 'rgba(59, 130, 246, 0.6)'], // blue
  [0.4, 'rgba(16, 185, 129, 0.7)'], // emerald
  [0.6, 'rgba(234, 179, 8, 0.85)'], // yellow
  [0.8, 'rgba(249, 115, 22, 0.95)'], // orange
  [1.0, 'rgba(239, 68, 68, 1)'] // red
];

let cachedPalette = null;
let cachedStamp = null;

/** 256-entry RGBA lookup table used to colorize the grayscale intensity buffer. */
function getPalette() {
  if (cachedPalette) return cachedPalette;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  GRADIENT_STOPS.forEach(([stop, color]) => grad.addColorStop(stop, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);
  cachedPalette = ctx.getImageData(0, 0, 1, 256).data;
  return cachedPalette;
}

/** Pre-rendered soft circle stamped once per incident. */
function getStamp() {
  if (cachedStamp) return cachedStamp;
  const size = RADIUS_PX * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(RADIUS_PX, RADIUS_PX, 0, RADIUS_PX, RADIUS_PX, RADIUS_PX);
  grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  cachedStamp = canvas;
  return cachedStamp;
}

/**
 * Builds a canvas-based heatmap overlay. google.maps.visualization.HeatmapLayer was
 * removed from the Maps JavaScript API (v3.65), so the density surface is drawn here.
 */
function createHeatmapOverlay(google) {
  class CanvasHeatmapOverlay extends google.maps.OverlayView {
    constructor() {
      super();
      this.points = [];
      this.canvas = null;
      this.idleListener = null;
    }

    onAdd() {
      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.opacity = String(OPACITY);
      this.getPanes().overlayLayer.appendChild(this.canvas);
      // draw() runs on zoom; also redraw after pans so newly visible areas are filled
      this.idleListener = this.getMap().addListener('idle', () => this.draw());
    }

    onRemove() {
      if (this.idleListener) google.maps.event.removeListener(this.idleListener);
      this.idleListener = null;
      this.canvas?.remove();
      this.canvas = null;
    }

    draw() {
      const map = this.getMap();
      const projection = this.getProjection();
      if (!this.canvas || !map || !projection) return;

      const bounds = map.getBounds();
      const mapDiv = map.getDiv();
      if (!bounds || !mapDiv) return;

      const width = mapDiv.offsetWidth + RADIUS_PX * 2;
      const height = mapDiv.offsetHeight + RADIUS_PX * 2;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const topLeft = projection.fromLatLngToDivPixel(new google.maps.LatLng(ne.lat(), sw.lng()));
      if (!topLeft) return;

      const originX = topLeft.x - RADIUS_PX;
      const originY = topLeft.y - RADIUS_PX;
      this.canvas.style.left = `${originX}px`;
      this.canvas.style.top = `${originY}px`;
      this.canvas.width = width;
      this.canvas.height = height;

      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, width, height);
      if (this.points.length === 0) return;

      const maxWeight = Math.max(...this.points.map(p => p.weight));
      const stamp = getStamp();

      for (const point of this.points) {
        const px = projection.fromLatLngToDivPixel(point.location);
        if (!px) continue;
        const x = px.x - originX;
        const y = px.y - originY;
        if (x < -RADIUS_PX || y < -RADIUS_PX || x > width + RADIUS_PX || y > height + RADIUS_PX) continue;
        ctx.globalAlpha = Math.min(Math.max(point.weight / maxWeight, MIN_POINT_ALPHA), 1);
        ctx.drawImage(stamp, x - RADIUS_PX, y - RADIUS_PX);
      }
      ctx.globalAlpha = 1;

      // Map accumulated alpha (intensity) onto the color gradient
      const image = ctx.getImageData(0, 0, width, height);
      const pixels = image.data;
      const palette = getPalette();
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];
        if (!alpha) continue;
        const offset = alpha * 4;
        pixels[i] = palette[offset];
        pixels[i + 1] = palette[offset + 1];
        pixels[i + 2] = palette[offset + 2];
        pixels[i + 3] = Math.min(alpha * 2, palette[offset + 3]);
      }
      ctx.putImageData(image, 0, 0);
    }
  }

  return new CanvasHeatmapOverlay();
}

/**
 * HeatmapLayer component drawing incident density on the Google Map.
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
    if (!map || !window.google?.maps?.OverlayView) {
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
        return { location, weight: 1 };
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
      heatmapRef.current = createHeatmapOverlay(window.google);
    }
    heatmapRef.current.points = data;
    if (heatmapRef.current.getMap() !== map) {
      heatmapRef.current.setMap(map);
    } else {
      heatmapRef.current.draw();
    }

    return () => {
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
      }
    };
  }, [map, events, enabled, timeHorizon, weightedBySeverity]);

  return null;
}
