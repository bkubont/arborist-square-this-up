/**
 * Server-enforced lifecycle rules for Estimate / ChangeOrder ("scope documents") and WorkItem. The
 * UI mirrors these, but they are only guaranteed here: the generic entity routes call these checks
 * so a hand-built request cannot skip them.
 *
 * Estimate / ChangeOrder: draft <-> sent while under negotiation; accepted / approved once a
 * customer actually signs (server/sign.js — never reachable through a plain edit); declined /
 * rejected when the customer says no through another channel; void to withdraw. Signed,
 * declined/rejected and void are all terminal: void it (already terminal, a no-op) or, if it needs
 * to be different, replace it — an Estimate/ChangeOrder is retired, not un-decided.
 */
import { fail, SCOPE_TERMINAL_STATUSES, SCOPE_SIGNED_STATUS } from './domain.js';

/** Status this document reaches when the owner records a decline by some channel other than e-sign. */
const DECLINE_STATUS = { Estimate: 'declined', ChangeOrder: 'rejected' };

function scopeNoun(entity) {
  return entity === 'ChangeOrder' ? 'change order' : 'estimate';
}

/**
 * Editing is only ever done through the generic PATCH route, which never carries a status — every
 * status change has its own action (send-sign, sign completion, decline, void), so there is nothing
 * to validate here beyond "is this document still open".
 * @param {string} entity @param {{ status?: string }} previous @param {{ status?: string }} [input]
 */
export function assertScopeUpdatable(entity, previous, input) {
  if (SCOPE_TERMINAL_STATUSES[entity].includes(previous.status)) {
    const reason = previous.status === SCOPE_SIGNED_STATUS[entity] ? 'Signed'
      : previous.status === DECLINE_STATUS[entity] ? (entity === 'ChangeOrder' ? 'Rejected' : 'Declined')
      : 'Void';
    throw fail(409, `${reason} ${scopeNoun(entity)}s cannot be edited. ${previous.status === 'void' ? 'Create a revision.' : 'Void it and create a revision, or add a change order.'}`);
  }
  if (input && input.status !== undefined) throw fail(400, 'Status changes go through Send, Decline or Void, not a direct edit');
}

/** Only an open (draft/sent) document can be hard-deleted; a decided one is permanent history — void it instead. */
export function assertScopeDeletable(entity, record) {
  if (SCOPE_TERMINAL_STATUSES[entity].includes(record.status)) throw fail(409, `This ${scopeNoun(entity)} is finalized and cannot be deleted. It stays as job history.`);
}

/**
 * A change order only makes sense once a signed estimate exists to change — checked both when the
 * change order is created and again when it is sent, since the active estimate could have been
 * voided in between.
 */
export function assertJobHasActiveEstimate(hasActiveEstimate, action = 'creating') {
  if (!hasActiveEstimate) throw fail(400, `Accept an estimate before ${action} a change order`);
}

/** Only a document currently out for signature can be marked declined/rejected by the owner. */
export function assertScopeDeclinable(entity, record) {
  if (record.status !== 'sent') throw fail(400, `Only a sent ${scopeNoun(entity)} can be declined`);
  return DECLINE_STATUS[entity];
}

/**
 * A WorkItem created from a signed line (has `source_type`) represents real signed scope, so it
 * can't be deleted outright — only a free-standing item the owner added by hand can be. Untick
 * "done" or edit its steps instead; if the scope itself changed, void the source document.
 */
export function assertWorkItemDeletable(item) {
  if (item.source_type) throw fail(409, 'This task comes from a signed document and cannot be deleted.');
}
