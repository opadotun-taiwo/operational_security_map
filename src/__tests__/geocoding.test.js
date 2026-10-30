import { describe, it, expect } from 'vitest';
import { parseAddressComponents } from '../services/geocoding';

describe('parseAddressComponents', () => {
  it('maps Geocoder results to state, LGA and place', () => {
    const components = [
      { long_name: '1', types: ['street_number'] },
      { long_name: 'Ibrahim Badamasi Babangida Road', types: ['route'] },
      { long_name: 'Minna', types: ['locality', 'political'] },
      { long_name: 'Sabon Gari', types: ['administrative_area_level_3', 'political'] },
      { long_name: 'Chanchaga', types: ['administrative_area_level_2', 'political'] },
      { long_name: 'Niger', types: ['administrative_area_level_1', 'political'] },
      { long_name: 'Nigeria', types: ['country', 'political'] }
    ];
    expect(parseAddressComponents(components)).toEqual({
      state: 'Niger',
      lga: 'Chanchaga',
      location: 'Ibrahim Badamasi Babangida Road, Minna',
      country: 'Nigeria'
    });
  });

  it('maps Places (New) results and prefers the place name', () => {
    const components = [
      { longText: 'Minna', types: ['locality'] },
      { longText: 'Chanchaga', types: ['administrative_area_level_2'] },
      { longText: 'Kano State', types: ['administrative_area_level_1'] }
    ];
    expect(parseAddressComponents(components, 'Kure Market')).toEqual({
      state: 'Kano',
      lga: 'Chanchaga',
      location: 'Kure Market, Minna',
      country: ''
    });
  });

  it('returns empty strings when nothing matches', () => {
    expect(parseAddressComponents([])).toEqual({ state: '', lga: '', location: '', country: '' });
  });
});
