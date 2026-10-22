import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapX, nearestX } from '../wrapped-map.js';

test('world coordinates recycle in both directions without accumulating offsets', () => {
  for (const turns of [-100000, -2, -1, 0, 1, 2, 100000]) {
    assert.equal(wrapX(25 + 3600 * turns, 3600), 25);
    assert.equal(wrapX(3599 + 3600 * turns, 3600), 3599);
  }
  assert.equal(wrapX(3600, 3600), 0);
  assert.equal(wrapX(-1, 3600), 3599);
});

test('reveal and reset use the nearest repeated position', () => {
  assert.equal(nearestX(50, 3550, 3600), 3650);
  assert.equal(nearestX(3550, 50, 3600), -50);
  assert.equal(nearestX(1600, 1800, 3600), 1600);
});
