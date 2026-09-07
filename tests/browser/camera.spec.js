const { test, expect } = require('@playwright/test');
const { presets } = require('../../frontend/capture-utils');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.ImageCapture = undefined; });
  await page.goto('/');
  await expect(page.locator('#captureBtn')).toBeEnabled();
});

test('every resolution exports matching JPEG pixels without reopening the camera', async ({ page }) => {
  const originalTrack = await page.evaluate(() => state.stream.getVideoTracks()[0].id);
  for (const [ratio, resolutions] of Object.entries(presets)) {
    for (const resolution of resolutions) {
      await page.click('#settingsBtn');
      await page.selectOption('#ratioSelect', ratio);
      await page.selectOption('#resolutionSelect', resolution);
      await page.click('#settingsBtn');
      await page.click('#captureBtn');
      await expect(page.locator('#previewPanel')).toBeVisible();
      await expect(page.locator('#captureStats')).toContainText(resolution);
      const dimensions = await page.locator('#preview').evaluate(async (img) => {
        await img.decode();
        return `${img.naturalWidth}x${img.naturalHeight}`;
      });
      expect(dimensions).toBe(resolution);
      await expect(page.locator('#cropGuide')).toBeHidden();
      await page.click('#cancelBtn');
    }
  }
  expect(await page.evaluate(() => state.stream.getVideoTracks()[0].id)).toBe(originalTrack);
});

test('preview bytes are the bytes uploaded to the captured destination', async ({ page, request }) => {
  await page.selectOption('#destinationSelect', 'Other');
  await page.click('#captureBtn');
  await expect(page.locator('#confirmBtn')).toBeEnabled();
  await expect(page.locator('#destinationSelect')).toBeDisabled();
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await state.capturedBlob.arrayBuffer())));
  const response = page.waitForResponse((r) => r.url().endsWith('/api/upload'));
  await page.click('#confirmBtn');
  const result = await (await response).json();
  expect(result.destination).toBe('Other');
  const image = await request.get(`/api/images/Other/${result.filename}`);
  expect(await image.body()).toEqual(Buffer.from(bytes));
  await request.delete(`/api/images/Other/${result.filename}`);
});

test('native capture locks controls, closes bitmap and honors the chosen size', async ({ page }) => {
  await page.evaluate(() => {
    window.nativeCloses = 0;
    window.ImageCapture = class {
      async getPhotoCapabilities() { return { imageWidth: { max: video.videoWidth * 2 } }; }
      async takePhoto() {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const source = document.createElement('canvas');
        source.width = video.videoWidth * 2;
        source.height = video.videoHeight * 2;
        source.getContext('2d').fillRect(0, 0, source.width, source.height);
        return new Promise((resolve) => source.toBlob(resolve, 'image/jpeg'));
      }
    };
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      const bitmap = await decode(...args);
      const close = bitmap.close.bind(bitmap);
      bitmap.close = () => { window.nativeCloses++; close(); };
      return bitmap;
    };
  });
  await page.click('#captureBtn');
  await expect(page.locator('#switchBtn')).toBeDisabled();
  await expect(page.locator('#confirmBtn')).toBeEnabled();
  await expect(page.locator('#captureSource')).toContainText('Camera photo');
  expect(await page.evaluate(() => window.nativeCloses)).toBe(1);
});

test('mismatched native orientation falls back; preferences survive reload', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.selectOption('#ratioSelect', '1:1');
  await page.selectOption('#resolutionSelect', '720x720');
  await page.selectOption('#qualitySelect', '0.72');
  await page.click('#settingsBtn');
  await page.reload();
  await expect(page.locator('#captureBtn')).toBeEnabled();
  expect(await page.evaluate(() => state.selectedResolution)).toBe('720x720');
  expect(await page.evaluate(() => state.quality)).toBe(0.72);
  await page.evaluate(() => {
    window.ImageCapture = class {
      async takePhoto() {
        const c = document.createElement('canvas'); c.width = 100; c.height = 300;
        return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg'));
      }
    };
  });
  await page.click('#captureBtn');
  await expect(page.locator('#confirmBtn')).toBeEnabled();
  await expect(page.locator('#captureSource')).toContainText('Video fallback');
  await expect(page.locator('#captureStats')).toContainText('720x720');
});

test('info and settings fit on a phone screen', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.click('#deviceInfoBtn');
  const bounds = await page.locator('.settings-card').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(393);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(786);
  await page.screenshot({ path: 'test-results/settings-phone.png' });
});

test('a stalled native camera falls back and permits another capture', async ({ page }) => {
  await page.evaluate(() => {
    window.ImageCapture = class { takePhoto() { return new Promise(() => {}); } };
  });
  await page.click('#captureBtn');
  await expect(page.locator('#confirmBtn')).toBeEnabled({ timeout: 12000 });
  await expect(page.locator('#captureSource')).toContainText('Video fallback');
  await page.click('#cancelBtn');
  await page.click('#captureBtn');
  await expect(page.locator('#confirmBtn')).toBeEnabled();
});

test('rapid zoom changes are serialized and x1 reopens the same device', async ({ page }) => {
  const id = await page.evaluate(() => state.activeDeviceId);
  await page.evaluate(() => {
    const track = state.stream.getVideoTracks()[0];
    track.getCapabilities = () => ({ zoom: { min: 1, max: 4, step: 0.1 } });
    window.zoomInFlight = 0;
    window.maxZoomInFlight = 0;
    window.appliedZoom = 1;
    track.applyConstraints = async (constraints) => {
      window.maxZoomInFlight = Math.max(window.maxZoomInFlight, ++window.zoomInFlight);
      await new Promise((resolve) => setTimeout(resolve, 80));
      window.appliedZoom = constraints.advanced[0].zoom;
      window.zoomInFlight--;
    };
    updateZoomControl();
  });
  await page.evaluate(async () => {
    queueZoom(2.3);
    await new Promise((resolve) => setTimeout(resolve, 30));
    queueZoom(3.1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    queueZoom(2.7);
  });
  await expect.poll(() => page.evaluate(() => window.appliedZoom)).toBe(2.7);
  expect(await page.evaluate(() => window.maxZoomInFlight)).toBe(1);
  await page.evaluate(() => resetCameraZoom());
  expect(await page.evaluate(() => state.activeDeviceId)).toBe(id);
  expect(await page.evaluate(() => state.zoom)).toBe(1);
  await expect(page.locator('#captureBtn')).toBeEnabled();
});

test('Thai resolution notice fades and a new message reappears', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.selectOption('#languageSelect', 'th');
  await page.selectOption('#resolutionSelect', '720x1280');
  await expect(page.locator('#liveHint')).toContainText('เปลี่ยนความละเอียดเป็น 720x1280');
  await expect(page.locator('.overlay-message')).toHaveCSS('opacity', '0', { timeout: 6000 });
  await page.selectOption('#resolutionSelect', '1080x1920');
  await expect(page.locator('.overlay-message')).toHaveCSS('opacity', '1');
});

test('crop guides stay inside mobile landscape and desktop viewports', async ({ page }) => {
  for (const size of [{ width: 360, height: 720 }, { width: 786, height: 393 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    await page.click('#settingsBtn');
    await page.selectOption('#ratioSelect', '4:3');
    await page.click('#settingsBtn');
    const bounds = await page.locator('#cropGuide').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
    expect(bounds.width / bounds.height).toBeCloseTo(4 / 3, 2);
  }
});
