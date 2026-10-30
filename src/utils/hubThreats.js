import * as turf from '@turf/turf';
import { nearestHub } from './routeComparison';

/** A hub is flagged when an incident within this distance happened inside the alert window. */
export const HUB_ALERT_RADIUS_KM = 5;
/** Incidents older than this (6 weeks) no longer turn a hub red or appear in hub alerts. */
export const HUB_ALERT_WINDOW_DAYS = 42;
/** Marker "recent" highlight window. */
export const RECENT_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

function toPoint(record) {
  const lat = parseFloat(record.latitude);
  const lng = parseFloat(record.longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  return turf.point([lng, lat]);
}

/**
 * Annotates incidents and hubs with proximity/threat flags.
 *
 * Incident fields added: isRecent (≤90 days), isNearHub (≤5 km of a hub and ≤6 weeks old),
 * nearestHubKm, nearestHubName. Hub field added: isThreatened (any isNearHub incident ≤5 km).
 *
 * @param {Array<Object>} rawEvents
 * @param {Array<Object>} rawHubs
 * @param {number} [now=Date.now()]
 * @returns {{ events: Array<Object>, hubs: Array<Object> }}
 */
export function annotateHubThreats(rawEvents = [], rawHubs = [], now = Date.now()) {
  const hubPoints = rawHubs.map(hub => ({ hub, point: toPoint(hub) })).filter(h => h.point);

  const events = rawEvents.map(event => {
    const time = event.date ? new Date(event.date).getTime() : NaN;
    const ageMs = now - time;
    const isRecent = Number.isFinite(ageMs) && ageMs <= RECENT_WINDOW_DAYS * DAY_MS;
    const inAlertWindow = Number.isFinite(ageMs) && ageMs <= HUB_ALERT_WINDOW_DAYS * DAY_MS;

    let isNearHub = false;
    const point = toPoint(event);
    if (inAlertWindow && point) {
      isNearHub = hubPoints.some(h => turf.distance(point, h.point, { units: 'kilometers' }) <= HUB_ALERT_RADIUS_KM);
    }

    return { ...event, isNearHub, isRecent, ...nearestHub(event, rawHubs) };
  });

  const alertPoints = events.filter(e => e.isNearHub).map(toPoint).filter(Boolean);
  const hubs = rawHubs.map(hub => {
    const point = toPoint(hub);
    const isThreatened = Boolean(point) && alertPoints.some(p => turf.distance(point, p, { units: 'kilometers' }) <= HUB_ALERT_RADIUS_KM);
    return { ...hub, isThreatened };
  });

  return { events, hubs };
}
