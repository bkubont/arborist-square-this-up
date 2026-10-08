import test from 'node:test';
import assert from 'node:assert/strict';
import { can, isCrewScopedRole, ROLES, permissionsForRole } from './roles.js';

test('owner has full company permissions', () => {
  assert.equal(can('owner', 'manage_members'), true);
  assert.equal(can('owner', 'delete_account'), true);
  assert.equal(can('owner', 'export_backup'), true);
  assert.ok(permissionsForRole('owner').length >= 15);
});

test('crew roles are scoped and cannot manage money or members', () => {
  for (const role of ['crew_leader', 'crew_member']) {
    assert.equal(isCrewScopedRole(role), true);
    assert.equal(can(role, 'manage_members'), false);
    assert.equal(can(role, 'view_money'), false);
    assert.equal(can(role, 'view_jobs'), true);
  }
  assert.equal(can('crew_leader', 'view_estimates'), true);
  assert.equal(can('crew_member', 'view_estimates'), false);
});

test('bookkeeper sees money but not crew management', () => {
  assert.equal(can('bookkeeper', 'view_money'), true);
  assert.equal(can('bookkeeper', 'edit_money'), true);
  assert.equal(can('bookkeeper', 'manage_crews'), false);
  assert.equal(can('bookkeeper', 'edit_jobs'), false);
});

test('all seven v1 roles are defined', () => {
  assert.deepEqual(ROLES, [
    'owner',
    'operations_manager',
    'office_admin',
    'estimator',
    'crew_leader',
    'crew_member',
    'bookkeeper',
  ]);
});
