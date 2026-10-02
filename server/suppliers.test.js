import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSupplierSuggestions, POPULAR_SUPPLIERS, SUPPLIER_SUGGESTIONS } from '../src/lib/suppliers.js';

test('supplier suggestions are curated arborist vendors (no invented / history learning)', () => {
  assert.ok(POPULAR_SUPPLIERS.includes('Crane rental'));
  assert.ok(SUPPLIER_SUGGESTIONS.includes('Chip dump'));
  const hits = filterSupplierSuggestions('crane');
  assert.ok(hits.includes('Crane rental'));
  // Free-text history is never stored — unknown strings are not suggested.
  assert.equal(filterSupplierSuggestions('TotallyMadeUpSupplierXYZ').length, 0);
  assert.ok(filterSupplierSuggestions('').length > 0);
});
