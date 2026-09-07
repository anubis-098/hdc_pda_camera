const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presets, outputSize, mapCrop } = require('../frontend/capture-utils');

test('all output presets have exact pixels and the selected aspect ratio', () => {
  for (const [ratio, resolutions] of Object.entries(presets)) {
    const [rw, rh] = ratio.split(':').map(Number);
    for (const resolution of resolutions) {
      const size = outputSize(ratio, resolution);
      assert.equal(`${size.width}x${size.height}`, resolution);
      assert.equal(size.width / size.height, rw / rh);
    }
  }
  assert.throws(() => outputSize('1:1', '1080x1920'));
});

test('native crop retains the exact normalized preview edges', () => {
  assert.deepEqual(mapCrop({ offsetX: 120, offsetY: 60, cropWidth: 600, cropHeight: 600 }, 1440, 1080, 4000, 3000), {
    offsetX: 120 * 4000 / 1440, offsetY: 60 * 3000 / 1080,
    cropWidth: 600 * 4000 / 1440, cropHeight: 600 * 3000 / 1080
  });
  assert.equal(mapCrop({}, 1440, 1080, 3000, 4000), null);
  assert.equal(mapCrop({}, 1440, 1080, 1920, 1080), null);
});
