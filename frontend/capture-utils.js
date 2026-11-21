(function (root) {
  'use strict';
  const legacyPresets = {
    '9:16': ['1080x1920', '720x1280', '576x1024'],
    '3:4': ['1080x1440', '960x1280', '768x1024'],
    '4:3': ['1440x1080', '1280x960', '1024x768'],
    '1:1': ['1080x1080', '960x960', '720x720']
  };
  const sizeTiers = ['high', 'medium', 'small'];
  const longestEdges = { high: 1920, medium: 1280, small: 1024 };
  function restoreSizeTier({ sizeTier, ratio, resolution }) {
    if (sizeTiers.includes(sizeTier)) return sizeTier;
    const previousSizes = Object.hasOwn(legacyPresets, ratio) ? legacyPresets[ratio] : [];
    return sizeTiers[previousSizes.indexOf(resolution)] ?? 'high';
  }
  function outputSize(viewWidth, viewHeight, sizeTier) {
    const scale = longestEdges[sizeTier] / Math.max(viewWidth, viewHeight);
    return {
      width: Math.max(1, Math.round(viewWidth * scale)),
      height: Math.max(1, Math.round(viewHeight * scale))
    };
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
  function fitCrop({ offsetX, offsetY, cropWidth, cropHeight }, aspect) {
    const width = Math.min(cropWidth, cropHeight * aspect);
    const height = Math.min(cropHeight, cropWidth / aspect);
    return {
      offsetX: offsetX + (cropWidth - width) / 2,
      offsetY: offsetY + (cropHeight - height) / 2,
      cropWidth: width,
      cropHeight: height
    };
  }
  const api = { outputSize, restoreSizeTier, mapCrop, fitCrop };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaptureUtils = api;
})(globalThis);
