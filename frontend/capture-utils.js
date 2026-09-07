(function (root) {
  'use strict';
  const presets = {
    '9:16': ['1080x1920', '720x1280', '576x1024'],
    '3:4': ['1080x1440', '960x1280', '768x1024'],
    '4:3': ['1440x1080', '1280x960', '1024x768'],
    '1:1': ['1080x1080', '960x960', '720x720']
  };
  function outputSize(ratio, resolution) {
    if (!presets[ratio]?.includes(resolution)) throw new Error('Invalid output resolution');
    const [width, height] = resolution.split('x').map(Number);
    return { width, height };
  }
  function mapCrop(crop, fromWidth, fromHeight, toWidth, toHeight) {
    // Different photo orientation/framing needs the visible video fallback.
    if (Math.abs((fromWidth / fromHeight) / (toWidth / toHeight) - 1) > 0.02) return null;
    return {
      offsetX: crop.offsetX * toWidth / fromWidth,
      offsetY: crop.offsetY * toHeight / fromHeight,
      cropWidth: crop.cropWidth * toWidth / fromWidth,
      cropHeight: crop.cropHeight * toHeight / fromHeight
    };
  }
  const api = { presets, outputSize, mapCrop };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaptureUtils = api;
})(globalThis);
