const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.ImageCapture = undefined; });
  await page.goto('/');
  await expect(page.locator('#captureBtn')).toBeEnabled();
});

test('every resolution exports matching JPEG pixels without reopening the camera', async ({ page }) => {
  const originalTrack = await page.evaluate(() => {
    const context = document.querySelector('#captureCanvas').getContext('2d', { alpha: false });
    const originalDraw = context.drawImage;
    context.drawImage = function (source, x, y, width, height, left, top, targetWidth, targetHeight) {
      window.captureScale = [targetWidth / width, targetHeight / height];
      return originalDraw.call(this, source, x, y, width, height, left, top, targetWidth, targetHeight);
    };
    return state.stream.getVideoTracks()[0].id;
  });
  for (const [tier, resolution] of Object.entries({ high: '960x1920', medium: '640x1280', small: '512x1024' })) {
    await page.click('#settingsBtn');
    await expect(page.locator('#ratioSelect')).toHaveCount(0);
    await page.selectOption('#resolutionSelect', tier);
    await page.click('#settingsBtn');
    await page.click('#captureBtn');
    await expect(page.locator('#previewPanel')).toBeVisible();
    await expect(page.locator('#captureStats')).toHaveText(resolution.replace('x', ' x '));
    const dimensions = await page.locator('#preview').evaluate(async (img) => {
      await img.decode();
      return `${img.naturalWidth}x${img.naturalHeight}`;
    });
    expect(dimensions).toBe(resolution);
    const [scaleX, scaleY] = await page.evaluate(() => window.captureScale);
    expect(scaleX).toBeCloseTo(scaleY, 8);
    await page.click('#cancelBtn');
  }
  expect(await page.evaluate(() => state.stream.getVideoTracks()[0].id)).toBe(originalTrack);
});

test('Other is the single default and custom folder works after reload', async ({ page }) => {
  const destination = page.locator('#destinationSelect');
  expect(await destination.locator('option').allTextContents()).toEqual(['Other']);
  const name = 'งานคลัง 1';
  await page.locator('#addFolderBtn').click();
  await page.locator('#folderName').fill(name);
  await page.locator('#createFolderBtn').click();
  await expect(destination).toHaveValue(name);
  await page.locator('#captureBtn').click();
  const upload = page.waitForResponse((response) => response.url().endsWith('/api/upload'));
  await page.locator('#confirmBtn').click();
  const response = await upload;
  expect(response.status()).toBe(201);
  const saved = await response.json();
  expect(saved.destination).toBe(name);

  await page.reload();
  await expect(destination).toHaveValue(name);
  await page.locator('#galleryBtn').click();
  await expect(page.locator('#galleryDestinationSelect')).toHaveValue(name);
  await expect(page.locator('#galleryGrid').getByAltText(saved.filename)).toBeVisible();
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
  await expect(page.locator('#captureStats')).toHaveText('960 x 1920');
  expect(await page.evaluate(() => window.nativeCloses)).toBe(1);
});

test('mismatched native orientation falls back; preferences survive reload', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.selectOption('#resolutionSelect', 'small');
  await page.selectOption('#qualitySelect', '0.72');
  await page.click('#settingsBtn');
  await page.reload();
  await expect(page.locator('#captureBtn')).toBeEnabled();
  expect(await page.evaluate(() => state.sizeTier)).toBe('small');
  expect(await page.evaluate(() => state.quality)).toBe(0.72);
  await page.evaluate(() => {
    window.nativeAttempted = false;
    window.ImageCapture = class {
      async takePhoto() {
        window.nativeAttempted = true;
        const c = document.createElement('canvas'); c.width = 100; c.height = 300;
        return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg'));
      }
    };
  });
  await page.click('#captureBtn');
  await expect(page.locator('#confirmBtn')).toBeEnabled();
  expect(await page.evaluate(() => window.nativeAttempted)).toBe(true);
  await expect(page.locator('#captureStats')).toHaveText('512 x 1024');
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
  await expect(page.locator('#captureStats')).toHaveText('960 x 1920');
  await page.click('#cancelBtn');
  await page.click('#captureBtn');
  await expect(page.locator('#confirmBtn')).toBeEnabled();
});

test('confirmation only shows image dimensions and review destination', async ({ page }) => {
  await page.selectOption('#destinationSelect', 'Other');
  await page.click('#captureBtn');
  await expect(page.locator('#captureStats')).toHaveText('960 x 1920');
  await expect(page.locator('#serverResult')).toHaveText('Review photo before upload | Other');
  await expect(page.locator('.preview-meta > div')).toHaveCount(2);
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
  await page.selectOption('#resolutionSelect', 'medium');
  await expect(page.locator('#liveHint')).toContainText('เปลี่ยนความละเอียดเป็น 640 x 1280');
  await expect(page.locator('.overlay-message')).toHaveCSS('opacity', '0', { timeout: 6000 });
  await page.selectOption('#resolutionSelect', 'high');
  await expect(page.locator('.overlay-message')).toHaveCSS('opacity', '1');
});

test('saved JPEG follows the visible camera in portrait, landscape and desktop', async ({ page }) => {
  const track = await page.evaluate(() => state.stream.getVideoTracks()[0].id);
  for (const [viewport, expected] of [
    [{ width: 360, height: 720 }, '960 x 1920'],
    [{ width: 786, height: 393 }, '1920 x 1397'],
    [{ width: 1280, height: 900 }, '1152 x 1920']
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#resolutionSelect option[value=high]')).toHaveText(expected);
    await page.locator('#captureBtn').click();
    await expect(page.locator('#captureStats')).toHaveText(expected);
    await page.locator('#cancelBtn').click();
  }
  expect(await page.evaluate(() => state.stream.getVideoTracks()[0].id)).toBe(track);
});
