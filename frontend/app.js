const state = {
  stream: null,
  devices: [],
  currentDeviceIndex: 0,
  uploadInFlight: false,
  capturedBlob: null,
  previewUrl: '',
  settingsOpen: false,
  language: 'en',
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
const gallerySelectAllBtn = document.getElementById('gallerySelectAllBtn');
const galleryDeleteSelectedBtn = document.getElementById('galleryDeleteSelectedBtn');
const gallerySelectionCount = document.getElementById('gallerySelectionCount');
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
const deviceInfoBtn = document.getElementById('deviceInfoBtn');
const deviceInfoPanel = document.getElementById('deviceInfoPanel');
const languageSelect = document.getElementById('languageSelect');
const destinationSelect = document.getElementById('destinationSelect');
const resolutionSelect = document.getElementById('resolutionSelect');
const ratioSelect = document.getElementById('ratioSelect');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const zoomSliderPanel = document.getElementById('zoomSliderPanel');
const captureBtn = document.getElementById('captureBtn');
const switchBtn = document.getElementById('switchBtn');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');

const activePointers = new Map();
let gestureStartX = 0;
let gestureStartZoom = 1;
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let zoomFrameRequest = 0;
let pendingZoom = 1;
let zoomResetInFlight = false;
const selectedGalleryImages = new Set();
let galleryImages = [];

const translations = {
  en: {
    saveTo: 'Save to',
    returnFolder: 'Return',
    outboundFolder: 'Outbound',
    otherFolder: 'Other',
    cameraSettings: 'Camera Settings',
    language: 'Language',
    resolution: 'Resolution',
    ratio: 'Ratio',
    gallery: 'Gallery',
    drag: 'Drag',
    alignCapture: 'Align item and tap capture',
    openingCamera: 'Opening camera',
    confirm: 'Confirm',
    cancel: 'Cancel',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    deleteSelected: 'Delete selected',
    selected: 'selected',
    delete: 'Delete',
    deviceInfo: 'Device information',
    cameraInfo: 'Current camera',
    cameraName: 'Camera',
    videoResolution: 'Video resolution',
    supportedResolution: 'Supported resolution',
    frameRate: 'Frame rate',
    facingMode: 'Facing mode',
    zoomRange: 'Zoom range',
    browser: 'Browser',
    notAvailable: 'Not available'
  },
  th: {
    saveTo: 'บันทึกที่',
    cameraSettings: 'ตั้งค่ากล้อง',
    language: 'ภาษา',
    resolution: 'ความละเอียด',
    ratio: 'อัตราส่วน',
    gallery: 'รูปภาพ',
    drag: 'ลากเพื่อปรับ',
    alignCapture: 'จัดตำแหน่งสิ่งของ แล้วกดถ่ายภาพ',
    openingCamera: 'กำลังเปิดกล้อง',
    confirm: 'ยืนยัน',
    cancel: 'ยกเลิก',
    selectAll: 'เลือกทั้งหมด',
    deselectAll: 'ยกเลิกการเลือกทั้งหมด',
    deleteSelected: 'ลบที่เลือก',
    selected: 'รายการที่เลือก',
    delete: 'ลบ',
    deviceInfo: 'ข้อมูลอุปกรณ์',
    cameraInfo: 'กล้องปัจจุบัน',
    cameraName: 'กล้อง',
    videoResolution: 'ความละเอียดวิดีโอ',
    supportedResolution: 'ความละเอียดที่รองรับ',
    frameRate: 'เฟรมเรต',
    facingMode: 'ทิศทางกล้อง',
    zoomRange: 'ช่วงซูม',
    browser: 'เบราว์เซอร์',
    notAvailable: 'ไม่พร้อมใช้งาน'
  }
};

function translate(key) {
  return translations[state.language][key] || translations.en[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = translate(element.dataset.i18n);
  }
  languageSelect.value = state.language;
  updateGallerySelectionUI();
}

function displayInfoValue(value) {
  return value === undefined || value === null || value === '' ? translate('notAvailable') : String(value);
}

function renderDeviceInfo() {
  const track = state.stream?.getVideoTracks()[0];
  const settings = track?.getSettings?.() || {};
  const capabilities = track?.getCapabilities?.() || {};
  const zoom = capabilities.zoom
    ? `${capabilities.zoom.min} - ${capabilities.zoom.max} (step ${capabilities.zoom.step ?? 0.1})`
    : translate('notAvailable');
  const supportedResolution = capabilities.width && capabilities.height
    ? `${capabilities.width.min}-${capabilities.width.max} x ${capabilities.height.min}-${capabilities.height.max}`
    : translate('notAvailable');

  const rows = [
    [translate('cameraName'), track?.label],
    [translate('videoResolution'), settings.width && settings.height ? `${settings.width} x ${settings.height}` : null],
    [translate('supportedResolution'), supportedResolution],
    [translate('frameRate'), settings.frameRate ? `${Number(settings.frameRate).toFixed(1)} fps` : null],
    [translate('facingMode'), settings.facingMode],
    [translate('zoomRange'), zoom],
    [translate('browser'), navigator.userAgent]
  ];

  deviceInfoPanel.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'device-info-heading';
  heading.textContent = `${translate('deviceInfo')} / ${translate('cameraInfo')}`;
  deviceInfoPanel.append(heading);

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'device-info-row';
    const key = document.createElement('span');
    key.textContent = label;
    const detail = document.createElement('strong');
    detail.textContent = displayInfoValue(value);
    row.append(key, detail);
    deviceInfoPanel.append(row);
  }
}

function getResolutionPreset() {
  const [width, height] = state.selectedResolution.split('x').map(Number);
  return { width, height };
}

function getCameraResolutionPreset() {
  // Keep one 4:3 sensor framing for every output ratio. The final crop is
  // handled by the on-screen guide, so changing ratio does not change FOV.
  const longSide = Math.max(getResolutionPreset().width, getResolutionPreset().height);
  if (longSide >= 1800) {
    return { width: 1440, height: 1080 };
  }
  if (longSide >= 1200) {
    return { width: 1280, height: 960 };
  }
  return { width: 1024, height: 768 };
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
  networkStatus.setAttribute('aria-label', text);
  networkStatus.title = text;
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

function updateZoomControl() {
  const track = state.stream?.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.();
  const supportsZoom = Boolean(capabilities && typeof capabilities.zoom === 'object');

  if (supportsZoom) {
    const maxZoom = Math.max(1, Math.floor(Number(capabilities.zoom.max ?? 1) * 10) / 10);
    const minZoom = Math.max(1, Math.ceil(Number(capabilities.zoom.min ?? 1) * 10) / 10);
    zoomSlider.min = String(Math.min(minZoom, maxZoom));
    zoomSlider.max = String(maxZoom);
    zoomSlider.step = '0.1';
    state.zoom = Math.min(maxZoom, Math.max(minZoom, state.zoom));
  } else {
    zoomSlider.min = '1';
    zoomSlider.max = '1';
    zoomSlider.step = '0.1';
    state.zoom = 1;
  }

  zoomSlider.disabled = !supportsZoom;
  zoomSlider.value = String(state.zoom);
  zoomValue.textContent = `x${Number(state.zoom).toFixed(1)}`;
  zoomValue.classList.toggle('is-unavailable', !supportsZoom);
  zoomValue.disabled = !supportsZoom;
}

function setZoomExpanded(expanded) {
  zoomSliderPanel.classList.toggle('hidden', !expanded);
  zoomValue.setAttribute('aria-expanded', String(expanded));
}

async function applyZoom(zoom) {
  const track = state.stream?.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.();
  if (!track) {
    return false;
  }

  // x1 means the camera's own default. Do not force zoom: 1 because some
  // Zebra camera profiles expose a different native default value.
  if (zoom === 1) {
    await track.applyConstraints({ advanced: [] });
    state.zoom = 1;
    updateZoomControl();
    return true;
  }

  if (!capabilities || typeof capabilities.zoom !== 'object') {
    return false;
  }

  const min = Number(capabilities.zoom.min ?? 1);
  const max = Number(capabilities.zoom.max ?? zoom);
  const value = Math.min(max, Math.max(min, zoom));

  await track.applyConstraints({ advanced: [{ zoom: value }] });
  state.zoom = value;
  updateZoomControl();
  return true;
}

async function resetCameraZoom() {
  if (zoomResetInFlight) {
    return;
  }

  zoomResetInFlight = true;
  state.zoom = 1;
  try {
    await openCamera(state.devices[state.currentDeviceIndex]?.deviceId);
  } finally {
    zoomResetInFlight = false;
  }
}

function setZoomDisplay(value) {
  const min = Number(zoomSlider.min);
  const max = Number(zoomSlider.max);
  const clamped = Math.min(max, Math.max(min, value));
  zoomSlider.value = String(clamped);
  zoomValue.textContent = `x${clamped.toFixed(1)}`;
}

function queueZoom(value) {
  const min = Number(zoomSlider.min);
  const max = Number(zoomSlider.max);
  pendingZoom = Math.min(max, Math.max(min, value));
  setZoomDisplay(pendingZoom);

  if (zoomFrameRequest) {
    return;
  }

  zoomFrameRequest = requestAnimationFrame(async () => {
    zoomFrameRequest = 0;
    if (pendingZoom <= 1) {
      return;
    }
    try {
      await applyZoom(pendingZoom);
    } catch (error) {
      console.error(error);
      liveHint.textContent = 'Unable to change zoom';
    }
  });
}

function getPointerDistance() {
  const pointers = [...activePointers.values()];
  if (pointers.length < 2) {
    return 0;
  }
  return Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
}

async function openCamera(deviceId) {
  await stopCamera();
  clearPreview();
  setStatus('Opening', 'warn');
  liveHint.textContent = translate('openingCamera');
  setSettingsOpen(false);

  const cameraPreset = getCameraResolutionPreset();

  const constraints = {
    audio: false,
    video: {
      width: { ideal: cameraPreset.width },
      height: { ideal: cameraPreset.height },
      aspectRatio: { ideal: 4 / 3 },
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
  updateZoomControl();
  if (!deviceInfoPanel.classList.contains('hidden')) {
    renderDeviceInfo();
  }
  if (state.zoom !== 1) {
    await applyZoom(state.zoom);
  }
  captureBtn.disabled = false;
  setStatus('Camera Ready', 'active');
  liveHint.textContent = translate('alignCapture');
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

function updateGallerySelectionUI() {
  const selectedCount = selectedGalleryImages.size;
  gallerySelectionCount.textContent = selectedCount ? `${selectedCount} ${translate('selected')}` : '';
  galleryDeleteSelectedBtn.disabled = selectedCount === 0;
  gallerySelectAllBtn.textContent = galleryImages.length > 0 && selectedCount === galleryImages.length
    ? translate('deselectAll')
    : translate('selectAll');
}

async function loadGallery() {
  const destination = galleryDestinationSelect.value;
  selectedGalleryImages.clear();
  galleryImages = [];
  updateGallerySelectionUI();
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

    galleryImages = result.images;
    galleryStatus.textContent = `${result.images.length} image(s)`;
    for (const image of result.images) {
      const item = document.createElement('article');
      item.className = 'gallery-item';

      const selectCheckbox = document.createElement('input');
      selectCheckbox.className = 'gallery-select';
      selectCheckbox.type = 'checkbox';
      selectCheckbox.checked = selectedGalleryImages.has(image.filename);
      selectCheckbox.setAttribute('aria-label', `Select ${image.filename}`);
      selectCheckbox.addEventListener('click', (event) => event.stopPropagation());
      selectCheckbox.addEventListener('change', () => {
        if (selectCheckbox.checked) {
          selectedGalleryImages.add(image.filename);
        } else {
          selectedGalleryImages.delete(image.filename);
        }
        item.classList.toggle('is-selected', selectCheckbox.checked);
        updateGallerySelectionUI();
      });

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
      deleteButton.textContent = translate('delete');
      deleteButton.addEventListener('click', () => deleteGalleryImage(destination, image.filename));

      item.append(selectCheckbox, thumbnail, details, deleteButton);
      galleryGrid.append(item);
    }
    updateGallerySelectionUI();
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
    await deleteGalleryImages(destination, [filename]);
    await loadGallery();
  } catch (error) {
    console.error(error);
    galleryStatus.textContent = error.message;
  }
}

async function deleteGalleryImages(destination, filenames) {
  for (const filename of filenames) {
    const response = await fetch(
      `/api/images/${encodeURIComponent(destination)}/${encodeURIComponent(filename)}`,
      { method: 'DELETE' }
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to delete image');
    }
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

deviceInfoBtn.addEventListener('click', () => {
  const isHidden = deviceInfoPanel.classList.contains('hidden');
  deviceInfoPanel.classList.toggle('hidden', !isHidden);
  settingsPanel.classList.toggle('info-open', isHidden);
  if (isHidden) {
    renderDeviceInfo();
  }
});

languageSelect.addEventListener('change', () => {
  state.language = languageSelect.value === 'th' ? 'th' : 'en';
  localStorage.setItem('pda-camera-language', state.language);
  applyLanguage();
  if (!galleryPanel.classList.contains('hidden')) {
    loadGallery();
  }
});

galleryBtn.addEventListener('click', () => setGalleryOpen(true));
galleryCloseBtn.addEventListener('click', () => setGalleryOpen(false));
galleryRefreshBtn.addEventListener('click', loadGallery);
galleryDestinationSelect.addEventListener('change', loadGallery);
gallerySelectAllBtn.addEventListener('click', () => {
  const shouldSelect = selectedGalleryImages.size !== galleryImages.length;
  selectedGalleryImages.clear();
  if (shouldSelect) {
    for (const image of galleryImages) {
      selectedGalleryImages.add(image.filename);
    }
  }
  for (const checkbox of galleryGrid.querySelectorAll('.gallery-select')) {
    checkbox.checked = shouldSelect;
    checkbox.closest('.gallery-item')?.classList.toggle('is-selected', shouldSelect);
  }
  updateGallerySelectionUI();
});
galleryDeleteSelectedBtn.addEventListener('click', async () => {
  const filenames = [...selectedGalleryImages];
  if (!filenames.length || !window.confirm(`Delete ${filenames.length} selected image(s)?`)) {
    return;
  }

  galleryDeleteSelectedBtn.disabled = true;
  galleryStatus.textContent = 'Deleting';
  try {
    await deleteGalleryImages(galleryDestinationSelect.value, filenames);
    await loadGallery();
  } catch (error) {
    console.error(error);
    galleryStatus.textContent = error.message;
    updateGallerySelectionUI();
  }
});
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

zoomSlider.addEventListener('input', () => {
  queueZoom(Number(zoomSlider.value));
});

zoomSlider.addEventListener('change', async () => {
  setZoomExpanded(false);
  if (Number(zoomSlider.value) > 1) {
    return;
  }

  try {
    await resetCameraZoom();
    liveHint.textContent = 'Zoom reset to default';
  } catch (error) {
    console.error(error);
    liveHint.textContent = 'Unable to reset zoom';
  }
});

zoomValue.addEventListener('click', () => {
  if (!zoomSlider.disabled) {
    setZoomExpanded(zoomSliderPanel.classList.contains('hidden'));
  }
});

video.addEventListener('pointerdown', (event) => {
  if (cameraShell.classList.contains('preview-mode') || zoomSlider.disabled) {
    return;
  }

  video.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size === 1) {
    gestureStartX = event.clientX;
    gestureStartZoom = state.zoom;
  } else if (activePointers.size === 2) {
    pinchStartDistance = getPointerDistance();
    pinchStartZoom = state.zoom;
  }
  event.preventDefault();
});

video.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) {
    return;
  }

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size >= 2 && pinchStartDistance > 0) {
    queueZoom(pinchStartZoom * (getPointerDistance() / pinchStartDistance));
  } else if (activePointers.size === 1) {
    // Horizontal drag: move right to zoom in, left to zoom out.
    queueZoom(gestureStartZoom + (event.clientX - gestureStartX) / 180);
  }
  event.preventDefault();
});

async function finishZoomGesture(event) {
  activePointers.delete(event.pointerId);
  if (activePointers.size !== 0) {
    return;
  }

  pinchStartDistance = 0;
  if (pendingZoom <= 1 && state.zoom > 1) {
    try {
      await resetCameraZoom();
      liveHint.textContent = 'Zoom reset to default';
    } catch (error) {
      console.error(error);
      liveHint.textContent = 'Unable to reset zoom';
    }
  }
}

video.addEventListener('pointerup', finishZoomGesture);
video.addEventListener('pointercancel', finishZoomGesture);

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
  const savedLanguage = localStorage.getItem('pda-camera-language');
  if (savedLanguage === 'th' || savedLanguage === 'en') {
    state.language = savedLanguage;
  }
  applyLanguage();
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
