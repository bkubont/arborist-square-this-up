import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSupplierSuggestions, POPULAR_SUPPLIERS, SUPPLIER_SUGGESTIONS } from '../src/lib/suppliers.js';

test('supplier suggestions are curated seed only (no invented / history learning)', () => {
  assert.ok(POPULAR_SUPPLIERS.includes('Home Depot'));
  assert.ok(SUPPLIER_SUGGESTIONS.includes('Big-box'));
  const hits = filterSupplierSuggestions('home');
  assert.ok(hits.includes('Home Depot'));
  // Free-text history is never stored — unknown strings are not suggested.
  assert.equal(filterSupplierSuggestions('TotallyMadeUpSupplierXYZ').length, 0);
  assert.ok(filterSupplierSuggestions('').length > 0);
});
