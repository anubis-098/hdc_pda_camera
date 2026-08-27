const state = {
  stream: null,
  devices: [],
  currentDeviceIndex: 0,
  uploadInFlight: false,
  capturedBlob: null,
  previewUrl: '',
  settingsOpen: false,
  zoom: 1,
  selectedResolution: '1080x1920',
  selectedRatio: '9:16'
};

const RATIO_PRESETS = {
  '9:16': ['1080x1920', '720x1280', '576x1024'],
  '3:4': ['1080x1440', '960x1280', '768x1024'],
  '4:3': ['1440x1080', '1280x960', '1024x768'],
  '1:1': ['1080x1080', '960x960', '720x720']
};

const cameraShell = document.querySelector('.camera-shell');
const video = document.getElementById('video');
const canvas = document.getElementById('captureCanvas');
const preview = document.getElementById('preview');
const cropGuide = document.getElementById('cropGuide');
const galleryBtn = document.getElementById('galleryBtn');
const galleryPanel = document.getElementById('galleryPanel');
const galleryCloseBtn = document.getElementById('galleryCloseBtn');
const galleryDestinationSelect = document.getElementById('galleryDestinationSelect');
const galleryRefreshBtn = document.getElementById('galleryRefreshBtn');
const galleryStatus = document.getElementById('galleryStatus');
const galleryGrid = document.getElementById('galleryGrid');
const imageViewer = document.getElementById('imageViewer');
const imageViewerCloseBtn = document.getElementById('imageViewerCloseBtn');
const imageViewerImage = document.getElementById('imageViewerImage');
const networkStatus = document.getElementById('networkStatus');
const captureStats = document.getElementById('captureStats');
const serverResult = document.getElementById('serverResult');
const liveHint = document.getElementById('liveHint');
const liveControls = document.getElementById('liveControls');
const previewPanel = document.getElementById('previewPanel');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBtn = document.getElementById('settingsBtn');
const destinationSelect = document.getElementById('destinationSelect');
const resolutionSelect = document.getElementById('resolutionSelect');
const ratioSelect = document.getElementById('ratioSelect');
const zoomButtons = [...document.querySelectorAll('[data-zoom]')];
const captureBtn = document.getElementById('captureBtn');
const switchBtn = document.getElementById('switchBtn');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');

function getResolutionPreset() {
  const [width, height] = state.selectedResolution.split('x').map(Number);
  return { width, height };
}

function getRatioAspect() {
  const [width, height] = state.selectedRatio.split(':').map(Number);
  return width / height;
}

function setGuideAspect() {
  const aspect = getRatioAspect();
  cameraShell.style.setProperty('--guide-aspect', String(aspect));
  cropGuide.classList.toggle('is-hidden-guide', state.selectedRatio === '9:16');
}

function syncResolutionOptions() {
  const options = RATIO_PRESETS[state.selectedRatio] || RATIO_PRESETS['9:16'];
  resolutionSelect.innerHTML = '';

  for (const value of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value.replace('x', ' x ');
    resolutionSelect.append(option);
  }

  if (!options.includes(state.selectedResolution)) {
    state.selectedResolution = options[0];
  }

  resolutionSelect.value = state.selectedResolution;
}

function setStatus(text, kind = 'idle') {
  networkStatus.textContent = text;
  const colors = {
    idle: '#667085',
    active: '#0d6c5a',
    warn: '#a35f09',
    error: '#9d2a2a'
  };
  networkStatus.style.background = colors[kind] || colors.idle;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setPreviewMode(enabled) {
  cameraShell.classList.toggle('preview-mode', enabled);
  previewPanel.classList.toggle('hidden', !enabled);
  liveControls.classList.toggle('hidden', enabled);
  liveHint.classList.toggle('hidden', enabled);
  cropGuide.classList.toggle('hidden', enabled);
  if (enabled) {
    setSettingsOpen(false);
  } else {
    setGuideAspect();
  }
}

function setSettingsOpen(enabled) {
  state.settingsOpen = enabled;
  settingsPanel.classList.toggle('hidden', !enabled);
  settingsBtn.classList.toggle('is-active', enabled);
  cropGuide.classList.toggle('hidden', enabled && cameraShell.classList.contains('preview-mode'));
}

function clearPreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }

  state.previewUrl = '';
  state.capturedBlob = null;
  preview.removeAttribute('src');
  captureStats.textContent = 'No image';
  serverResult.textContent = '';
  setPreviewMode(false);
}

async function listVideoDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  state.devices = devices.filter((device) => device.kind === 'videoinput');
}

async function stopCamera() {
  if (!state.stream) {
    return;
  }

  for (const track of state.stream.getTracks()) {
    track.stop();
  }

  state.stream = null;
}

function updateZoomButtons() {
  const track = state.stream?.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.();
  const supportsZoom = Boolean(capabilities && typeof capabilities.zoom === 'object');

  for (const button of zoomButtons) {
    button.disabled = !supportsZoom;
    button.classList.toggle('is-active', Number(button.dataset.zoom) === state.zoom);
  }
}

async function applyZoom(zoom) {
  const track = state.stream?.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.();
  if (!track || !capabilities || typeof capabilities.zoom !== 'object') {
    return false;
  }

  const min = Number(capabilities.zoom.min ?? 1);
  const max = Number(capabilities.zoom.max ?? zoom);
  const value = Math.min(max, Math.max(min, zoom));

  await track.applyConstraints({ advanced: [{ zoom: value }] });
  state.zoom = value;
  updateZoomButtons();
  return true;
}

async function openCamera(deviceId) {
  await stopCamera();
  clearPreview();
  setStatus('Opening', 'warn');
  liveHint.textContent = 'Opening camera';
  setSettingsOpen(false);

  const preset = getResolutionPreset();

  const constraints = {
    audio: false,
    video: {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      facingMode: 'environment'
    }
  };

  if (deviceId) {
    constraints.video.deviceId = { exact: deviceId };
  }

  state.stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = state.stream;
  await video.play();
  await listVideoDevices();
  updateZoomButtons();
  if (state.zoom !== 1) {
    await applyZoom(state.zoom);
  }
  captureBtn.disabled = false;
  setStatus('Camera Ready', 'active');
  liveHint.textContent = 'Align item and tap capture';
}

function nextDeviceId() {
  if (state.devices.length === 0) {
    return null;
  }

  state.currentDeviceIndex = (state.currentDeviceIndex + 1) % state.devices.length;
  return state.devices[state.currentDeviceIndex].deviceId;
}

function getDisplayedVideoContent(videoRect, sourceWidth, sourceHeight) {
  // CSS object-fit: cover scales the source until it fills the video box,
  // then hides the overflow from the sides or top/bottom.
  const scale = Math.max(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
  const contentWidth = sourceWidth * scale;
  const contentHeight = sourceHeight * scale;

  return {
    left: videoRect.left + (videoRect.width - contentWidth) / 2,
    top: videoRect.top + (videoRect.height - contentHeight) / 2,
    width: contentWidth,
    height: contentHeight
  };
}

function getSourceCropRect(sourceWidth, sourceHeight) {
  const videoRect = video.getBoundingClientRect();
  const content = getDisplayedVideoContent(videoRect, sourceWidth, sourceHeight);
  const guideIsVisible = !cropGuide.classList.contains('is-hidden-guide');
  const cropRect = guideIsVisible ? cropGuide.getBoundingClientRect() : videoRect;

  // Map the visible guide edges from screen coordinates into source pixels.
  const left = Math.max(content.left, Math.min(cropRect.left, content.left + content.width));
  const top = Math.max(content.top, Math.min(cropRect.top, content.top + content.height));
  const right = Math.max(left, Math.min(cropRect.right, content.left + content.width));
  const bottom = Math.max(top, Math.min(cropRect.bottom, content.top + content.height));

  const sourceLeft = (left - content.left) / content.width * sourceWidth;
  const sourceTop = (top - content.top) / content.height * sourceHeight;
  const sourceRight = (right - content.left) / content.width * sourceWidth;
  const sourceBottom = (bottom - content.top) / content.height * sourceHeight;

  return {
    offsetX: sourceLeft,
    offsetY: sourceTop,
    cropWidth: Math.max(1, sourceRight - sourceLeft),
    cropHeight: Math.max(1, sourceBottom - sourceTop)
  };
}

function drawFrameToCanvas() {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('video is not ready');
  }

  const { offsetX, offsetY, cropWidth, cropHeight } = getSourceCropRect(
    sourceWidth,
    sourceHeight
  );

  const maxLongSide = 1920;
  const scale = Math.min(1, maxLongSide / Math.max(cropWidth, cropHeight));
  const targetWidth = Math.max(1, Math.round(cropWidth * scale));
  const targetHeight = Math.max(1, Math.round(cropHeight * scale));

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  context.drawImage(
    video,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  return { width: targetWidth, height: targetHeight };
}

function canvasToBlob(quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas export failed'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', quality);
  });
}

async function compressCapture() {
  const { width, height } = drawFrameToCanvas();
  let blob = await canvasToBlob(0.82);

  if (blob.size > 320 * 1024) {
    blob = await canvasToBlob(0.72);
  }

  if (blob.size > 260 * 1024) {
    blob = await canvasToBlob(0.64);
  }

  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }

  state.previewUrl = URL.createObjectURL(blob);
  preview.src = state.previewUrl;
  captureStats.textContent = `${width}x${height} | ${formatBytes(blob.size)}`;
  serverResult.textContent = 'Review photo before upload';

  return blob;
}

async function uploadCapture(blob) {
  const extension = '.jpg';
  const filename = `capture_${Date.now()}${extension}`;
  const formData = new FormData();
  formData.append('destination', destinationSelect.value);
  formData.append('image', blob, filename);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'upload failed');
  }

  return result;
}

function setGalleryOpen(enabled) {
  galleryPanel.classList.toggle('hidden', !enabled);
  if (enabled) {
    setSettingsOpen(false);
    loadGallery();
  }
}

function setImageViewerOpen(url) {
  imageViewerImage.src = url || '';
  imageViewer.classList.toggle('hidden', !url);
}

function formatGalleryDate(value) {
  return new Date(value).toLocaleString();
}

async function loadGallery() {
  const destination = galleryDestinationSelect.value;
  galleryStatus.textContent = 'Loading';
  galleryGrid.replaceChildren();

  try {
    const response = await fetch(`/api/images?destination=${encodeURIComponent(destination)}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to load gallery');
    }

    if (result.images.length === 0) {
      galleryStatus.textContent = 'No images in this folder';
      return;
    }

    galleryStatus.textContent = `${result.images.length} image(s)`;
    for (const image of result.images) {
      const item = document.createElement('article');
      item.className = 'gallery-item';

      const thumbnail = document.createElement('img');
      thumbnail.src = image.url;
      thumbnail.alt = image.filename;
      thumbnail.loading = 'lazy';
      thumbnail.addEventListener('click', () => setImageViewerOpen(image.url));

      const details = document.createElement('div');
      details.className = 'gallery-item-details';
      details.textContent = `${formatBytes(image.size)} | ${formatGalleryDate(image.modifiedAt)}`;

      const deleteButton = document.createElement('button');
      deleteButton.className = 'btn gallery-delete';
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => deleteGalleryImage(destination, image.filename));

      item.append(thumbnail, details, deleteButton);
      galleryGrid.append(item);
    }
  } catch (error) {
    console.error(error);
    galleryStatus.textContent = error.message;
  }
}

async function deleteGalleryImage(destination, filename) {
  if (!window.confirm(`Delete ${filename}?`)) {
    return;
  }

  try {
    const response = await fetch(
      `/api/images/${encodeURIComponent(destination)}/${encodeURIComponent(filename)}`,
      { method: 'DELETE' }
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to delete image');
    }
    await loadGallery();
  } catch (error) {
    console.error(error);
    galleryStatus.textContent = error.message;
  }
}

async function handleCapture() {
  if (state.uploadInFlight) {
    return;
  }

  captureBtn.disabled = true;
  setStatus('Compressing', 'warn');

  try {
    state.capturedBlob = await compressCapture();
    setPreviewMode(true);
    setStatus('Preview', 'warn');
  } catch (error) {
    console.error(error);
    setStatus('Error', 'error');
    liveHint.textContent = error.message;
  } finally {
    captureBtn.disabled = false;
  }
}

async function handleConfirm() {
  if (state.uploadInFlight || !state.capturedBlob) {
    return;
  }

  state.uploadInFlight = true;
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  setStatus('Uploading', 'warn');
  serverResult.textContent = 'Uploading';

  try {
    const result = await uploadCapture(state.capturedBlob);
    setStatus('Uploaded', 'active');
    serverResult.textContent = `${result.destination} | ${result.filename}`;
    liveHint.textContent = 'Saved to storage root';
    clearPreview();
  } catch (error) {
    console.error(error);
    setStatus('Error', 'error');
    serverResult.textContent = error.message;
    cancelBtn.disabled = false;
  } finally {
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    state.uploadInFlight = false;
    captureBtn.disabled = false;
  }
}

captureBtn.addEventListener('click', handleCapture);
confirmBtn.addEventListener('click', handleConfirm);
cancelBtn.addEventListener('click', () => {
  clearPreview();
  setStatus('Camera Ready', 'active');
  liveHint.textContent = 'Capture cancelled';
});

settingsBtn.addEventListener('click', () => {
  if (cameraShell.classList.contains('preview-mode')) {
    return;
  }

  setSettingsOpen(!state.settingsOpen);
});

galleryBtn.addEventListener('click', () => setGalleryOpen(true));
galleryCloseBtn.addEventListener('click', () => setGalleryOpen(false));
galleryRefreshBtn.addEventListener('click', loadGallery);
galleryDestinationSelect.addEventListener('change', loadGallery);
imageViewerCloseBtn.addEventListener('click', () => setImageViewerOpen(''));
imageViewer.addEventListener('click', (event) => {
  if (event.target === imageViewer) {
    setImageViewerOpen('');
  }
});

switchBtn.addEventListener('click', async () => {
  try {
    const deviceId = nextDeviceId();
    await openCamera(deviceId);
  } catch (error) {
    console.error(error);
    setStatus('Switch Failed', 'error');
    liveHint.textContent = error.message;
  }
});

resolutionSelect.addEventListener('change', async () => {
  state.selectedResolution = resolutionSelect.value;

  try {
    await openCamera(state.devices[state.currentDeviceIndex]?.deviceId);
    liveHint.textContent = `Resolution set to ${resolutionSelect.value}`;
  } catch (error) {
    console.error(error);
    setStatus('Resolution Failed', 'error');
    liveHint.textContent = error.message;
  }
});

ratioSelect.addEventListener('change', async () => {
  state.selectedRatio = ratioSelect.value;
  syncResolutionOptions();
  setGuideAspect();
  liveHint.textContent = `Ratio set to ${ratioSelect.options[ratioSelect.selectedIndex].text}`;

  try {
    await openCamera(state.devices[state.currentDeviceIndex]?.deviceId);
  } catch (error) {
    console.error(error);
    setStatus('Ratio Failed', 'error');
    liveHint.textContent = error.message;
  }
});

for (const button of zoomButtons) {
  button.addEventListener('click', async () => {
    try {
      const applied = await applyZoom(Number(button.dataset.zoom));
      if (!applied) {
        liveHint.textContent = 'Zoom is not supported by this camera';
      }
    } catch (error) {
      console.error(error);
      liveHint.textContent = 'Unable to change zoom';
    }
  });
}

document.addEventListener('click', (event) => {
  if (!state.settingsOpen) {
    return;
  }

  const clickedInsidePanel = settingsPanel.contains(event.target);
  const clickedSettingsButton = settingsBtn.contains(event.target);
  if (!clickedInsidePanel && !clickedSettingsButton) {
    setSettingsOpen(false);
  }
});

window.addEventListener('load', async () => {
  setStatus('Ready', 'idle');
  setPreviewMode(false);
  ratioSelect.value = state.selectedRatio;
  syncResolutionOptions();
  setGuideAspect();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Unsupported', 'error');
    liveHint.textContent = 'Browser does not support camera APIs.';
    return;
  }

  try {
    await listVideoDevices();
    await openCamera();
  } catch (error) {
    console.error(error);
    setStatus('Camera Blocked', 'error');
    liveHint.textContent = 'Camera access requires HTTPS or trusted local origin.';
  }
});
