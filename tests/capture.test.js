const { test } = require('node:test');
const assert = require('node:assert/strict');
const { outputSize, restoreSizeTier, mapCrop, fitCrop } = require('../frontend/capture-utils');

test('output follows the preview shape and rounds to whole pixels', () => {
  assert.deepEqual(outputSize(393, 786, 'high'), { width: 960, height: 1920 });
  assert.deepEqual(outputSize(786, 393, 'medium'), { width: 1280, height: 640 });
  assert.deepEqual(outputSize(393, 800, 'small'), { width: 503, height: 1024 });
});

test('restores the corresponding size tier for old saved settings', () => {
  assert.equal(restoreSizeTier({ ratio: '4:3', resolution: '1280x960' }), 'medium');
  assert.equal(restoreSizeTier({ ratio: '1:1', resolution: '720x720' }), 'small');
  assert.equal(restoreSizeTier({ sizeTier: 'medium' }), 'medium');
  assert.equal(restoreSizeTier({ ratio: 'constructor' }), 'high');
});

test('native crop retains the exact normalized preview edges', () => {
  assert.deepEqual(mapCrop({ offsetX: 120, offsetY: 60, cropWidth: 600, cropHeight: 600 }, 1440, 1080, 4000, 3000), {
    offsetX: 120 * 4000 / 1440, offsetY: 60 * 3000 / 1080,
    cropWidth: 600 * 4000 / 1440, cropHeight: 600 * 3000 / 1080
  });
  assert.equal(mapCrop({}, 1440, 1080, 3000, 4000), null);
  assert.equal(mapCrop({}, 1440, 1080, 1920, 1080), null);
});

test('portrait and landscape crops keep their center while matching the output', () => {
  assert.deepEqual(fitCrop({ offsetX: 10, offsetY: 20, cropWidth: 1600, cropHeight: 900 }, 9 / 16), {
    offsetX: 556.875, offsetY: 20, cropWidth: 506.25, cropHeight: 900
  });
  assert.deepEqual(fitCrop({ offsetX: 10, offsetY: 20, cropWidth: 900, cropHeight: 1600 }, 4 / 3), {
    offsetX: 10, offsetY: 482.5, cropWidth: 900, cropHeight: 675
  });
});
