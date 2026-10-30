import { describe, it, expect } from 'vitest';
import { canonicalState, getOperatingStates, isInOperatingStates, matchOperatingState } from '../utils/operatingStates';

const hubs = [
  { id: 1, latitude: 9.62, longitude: 6.55, location_name: 'Minna', state: 'Niger State' },
  { id: 2, latitude: 10.52, longitude: 7.44, location_name: 'Kaduna', state: 'Kaduna' },
  { id: 3, latitude: 9.07, longitude: 7.48, location_name: 'Abuja', state: 'Federal Capital Territory' },
  { id: 4, latitude: 9.08, longitude: 6.01, location_name: 'Bida' } // no state recorded
];
const events = [
  { state: 'Niger', latitude: 9.1, longitude: 6.02 },
  { state: 'FCT', latitude: 9.0, longitude: 7.4 },
  { state: 'Zamfara', latitude: 12.1, longitude: 5.9 },
  { state: 'Oyo', latitude: 7.4, longitude: 3.9 },
  { state: 'kano state', latitude: 12.0, longitude: 8.5 }
];

describe('canonicalState', () => {
  it('ignores case, spacing and the word "State"', () => {
    expect(canonicalState('Niger State')).toBe('niger');
    expect(canonicalState(' kano ')).toBe('kano');
    expect(canonicalState('Cross River')).toBe('crossriver');
  });

  it('collapses FCT spellings', () => {
    for (const name of ['FCT', 'Abuja', 'Federal Capital Territory', 'FCT - Abuja']) {
      expect(canonicalState(name)).toBe('fct');
    }
  });
});

describe('getOperatingStates', () => {
  const ops = getOperatingStates(hubs, events);

  it('combines hub states with the expansion states, using the data spelling', () => {
    expect(ops.hubStates).toEqual(['FCT', 'Kaduna', 'Niger']);
    expect(ops.expansionStates).toEqual(['Jigawa', 'Gombe', 'Oyo', 'Kano']);
    expect(ops.all).toHaveLength(7);
  });

  it('keeps only incidents in operating states', () => {
    expect(events.filter(e => isInOperatingStates(e, ops)).map(e => e.state)).toEqual(['Niger', 'FCT', 'Oyo', 'kano state']);
  });

  it('matches a geocoded state name to the operating list', () => {
    expect(matchOperatingState('Federal Capital Territory', ops)).toBe('FCT');
    expect(matchOperatingState('Zamfara', ops)).toBeNull();
  });
});
