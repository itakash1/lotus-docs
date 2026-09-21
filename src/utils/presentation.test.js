import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSaving, formatBytes, formatPercent } from './presentation.js';

test('small savings are visible and never rounded to minus zero', () => {
  assert.equal(formatPercent(.01), '<0,1%');
  assert.notEqual(formatBytes(1048576), formatBytes(1000000));
  assert.match(describeSaving(1000000, 999990), /Меньше на 10 Б/);
  assert.doesNotMatch(describeSaving(1000000,1000000), /−0|Меньше/);
});
