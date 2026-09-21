import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapPhotonFeature,
  isStreetLevelSuggestion,
  suggestAddresses,
} from './addressSuggest.js';
import { parseGoogleAddressComponents, parsePhotonFeature } from '../src/lib/address.js';

test('mapPhotonFeature keeps housenumber + street and never uses city name as street', () => {
  const house = mapPhotonFeature({
    properties: {
      type: 'house',
      housenumber: '123',
      street: 'Oak St',
      city: 'Springfield',
      state: 'Illinois',
      postcode: '62701',
      osm_id: 1,
    },
  });
  assert.equal(house.parsed.address, '123 Oak St');
  assert.equal(house.parsed.city, 'Springfield');
  assert.equal(house.parsed.state, 'Illinois');
  assert.equal(house.parsed.zip, '62701');
  assert.equal(isStreetLevelSuggestion(house), true);

  const cityOnly = mapPhotonFeature({
    properties: {
      type: 'city',
      name: 'Springfield',
      city: 'Springfield',
      state: 'Maine',
      osm_id: 2,
    },
  });
  assert.equal(cityOnly.parsed.address, '');
  assert.equal(isStreetLevelSuggestion(cityOnly), false);
});

test('mapPhotonFeature street layer uses name when street prop missing', () => {
  const street = mapPhotonFeature({
    properties: {
      type: 'street',
      name: 'Oak Street',
      city: 'Springfield',
      state: 'Illinois',
      osm_id: 3,
    },
  });
  assert.equal(street.parsed.address, 'Oak Street');
  assert.equal(isStreetLevelSuggestion(street), true);
});

test('suggestAddresses requests house/street layers and drops locality hits', async () => {
  /** @type {string} */
  let calledUrl = '';
  const fetchImpl = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      async json() {
        return {
          features: [
            {
              properties: {
                type: 'city',
                name: 'Springfield',
                city: 'Springfield',
                state: 'Maine',
                osm_id: 10,
              },
            },
            {
              properties: {
                type: 'house',
                housenumber: '123',
                street: 'Oak St',
                city: 'Springfield',
                state: 'Illinois',
                postcode: '62701',
                osm_id: 11,
              },
            },
            {
              properties: {
                type: 'street',
                name: 'Oak Street',
                street: 'Oak Street',
                city: 'Springfield',
                state: 'Illinois',
                osm_id: 12,
              },
            },
          ],
        };
      },
    };
  };

  const items = await suggestAddresses('123 Oak Springfield', { fetchImpl, limit: 6 });
  assert.match(calledUrl, /layer=house/);
  assert.match(calledUrl, /layer=street/);
  assert.match(calledUrl, /countrycode=us/);
  assert.equal(items.length, 2);
  assert.equal(items[0].parsed.address, '123 Oak St');
  assert.equal(items[0].parsed.city, 'Springfield');
  assert.equal(items[0].parsed.zip, '62701');
  assert.ok(items.every((item) => item.parsed.address && item.parsed.address !== item.parsed.city));
  assert.equal(items[0]._meta, undefined);
});

test('parseGoogleAddressComponents maps street separately from city', () => {
  const parsed = parseGoogleAddressComponents([
    { long_name: '1600', short_name: '1600', types: ['street_number'] },
    { long_name: 'Pennsylvania Avenue NW', short_name: 'Pennsylvania Ave NW', types: ['route'] },
    { long_name: 'Washington', short_name: 'Washington', types: ['locality', 'political'] },
    { long_name: 'District of Columbia', short_name: 'DC', types: ['administrative_area_level_1', 'political'] },
    { long_name: '20500', short_name: '20500', types: ['postal_code'] },
    { long_name: 'Northwest', short_name: 'NW', types: ['neighborhood', 'political'] },
  ]);
  assert.equal(parsed.address, '1600 Pennsylvania Avenue NW');
  assert.equal(parsed.city, 'Washington');
  assert.equal(parsed.state, 'DC');
  assert.equal(parsed.zip, '20500');
});

test('parseGoogleAddressComponents does not use locality as street when components lack route', () => {
  const parsed = parseGoogleAddressComponents(
    [
      { long_name: 'Springfield', short_name: 'Springfield', types: ['locality', 'political'] },
      { long_name: 'Illinois', short_name: 'IL', types: ['administrative_area_level_1', 'political'] },
    ],
    { formattedAddress: 'Springfield, IL, USA' },
  );
  assert.equal(parsed.address, '');
  assert.equal(parsed.city, 'Springfield');
  assert.equal(parsed.state, 'IL');
});

test('parsePhotonFeature ignores city-type name as street', () => {
  const parsed = parsePhotonFeature({
    type: 'city',
    name: 'Springfield',
    city: 'Springfield',
    state: 'Maine',
  });
  assert.equal(parsed.address, '');
  assert.equal(parsed.city, 'Springfield');
});
