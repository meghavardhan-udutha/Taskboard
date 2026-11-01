import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskText } from '../src/services/nlp.js';

const members = [
  { _id: 'a1', name: 'Ana K', email: 'ana@x.com' },
  { _id: 'b2', name: 'Ben Carter', email: 'ben@x.com' },
];
const now = new Date(2026, 9, 31); // Saturday 31 Oct 2026

test('full sentence', () => {
  const r = parseTaskText('Fix login bug tomorrow high priority @ben #backend 2h', members, now);
  assert.equal(r.title, 'Fix login bug');
  assert.equal(r.priority, 'high');
  assert.equal(r.dueDate, '2026-11-01');
  assert.equal(r.estimateMinutes, 120);
  assert.deepEqual(r.labels, ['backend']);
  assert.deepEqual(r.assigneeIds, ['b2']);
});
test('weekday and minutes', () => {
  const r = parseTaskText('Write report by friday 45 min urgent', members, now);
  assert.equal(r.dueDate, '2026-11-06');
  assert.equal(r.estimateMinutes, 45);
  assert.equal(r.priority, 'urgent');
  assert.equal(r.title, 'Write report');
});
test('next monday, in N days, ISO and month-day', () => {
  assert.equal(parseTaskText('Plan sprint next monday', members, now).dueDate, '2026-11-09');
  assert.equal(parseTaskText('Plan sprint in 3 days', members, now).dueDate, '2026-11-03');
  assert.equal(parseTaskText('Ship 2026-12-05', members, now).dueDate, '2026-12-05');
  assert.equal(parseTaskText('Pay invoices due Nov 20', members, now).dueDate, '2026-11-20');
  assert.equal(parseTaskText('Pay invoices 5 jan', members, now).dueDate, '2027-01-05');
});
test('unknown mention is reported, plain title untouched', () => {
  const r = parseTaskText('Call vendor @zed', members, now);
  assert.deepEqual(r.unmatched, ['zed']);
  assert.equal(r.title, 'Call vendor');
  assert.equal(r.priority, undefined);
  assert.equal(r.dueDate, null);
});
