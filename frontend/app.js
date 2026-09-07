const state = {
  stream: null,
  devices: [],
  currentDeviceIndex: 0,
  activeDeviceId: '',
  uploadInFlight: false,
  captureInFlight: false,
  cameraOpening: false,
  capturedDestination: '',
  quality: 0.9,
  capturedBlob: null,
  previewUrl: '',
  settingsOpen: false,
  language: 'en',
  zoom: 1,
  selectedResolution: '1080x1920',
  selectedRatio: '9:16'
};

const RATIO_PRESETS = CaptureUtils.presets;

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
const captureSource = document.getElementById('captureSource');
const serverResult = document.getElementById('serverResult');
const liveHint = document.getElementById('liveHint');
const liveControls = document.getElementById('liveControls');
const previewPanel = document.getElementById('previewPanel');
const messageOverlay = document.querySelector('.overlay-message');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBtn = document.getElementById('settingsBtn');
const deviceInfoBtn = document.getElementById('deviceInfoBtn');
const deviceInfoPanel = document.getElementById('deviceInfoPanel');
const languageSelect = document.getElementById('languageSelect');
const destinationSelect = document.getElementById('destinationSelect');
const resolutionSelect = document.getElementById('resolutionSelect');
const ratioSelect = document.getElementById('ratioSelect');
const qualitySelect = document.getElementById('qualitySelect');
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
let liveHintFadeTimer;
const selectedGalleryImages = new Set();
let galleryImages = [];
let galleryRequestId = 0;
let galleryDeleting = false;
let zoomOperation = Promise.resolve();
let zoomRevision = 0;
let nativeCaptureDisabled = false;

const translations = {
  en: {
    saveTo: 'Save to',
    inboundFolder: 'Inbound',
    returnFolder: 'Return',
    outboundFolder: 'Outbound',
    otherFolder: 'Other',
    cameraSettings: 'Camera Settings',
    language: 'Language',
    resolution: 'Saved image size',
    quality: 'Image quality',
    qualityHigh: 'High clarity',
    qualityBalanced: 'Balanced',
    qualitySmall: 'Smaller file',
    outputHelp: 'The saved image matches the selected size. File size varies with detail.',
    nativePhoto: 'Camera photo',
    videoPhoto: 'Video fallback',
    enlarged: 'Enlarged from a smaller source; detail may be limited.',
    reviewPhoto: 'Review photo before upload',
    savedTo: 'Saved to',
    captureCancelled: 'Capture cancelled',
    uploading: 'Uploading',
    ratioChanged: 'Ratio set to',
    cameraUnavailable: 'Camera unavailable. Tap switch camera to retry.',
    requestFailed: 'Unable to contact the server. Check the connection and try again.',
    uploadUncertain: 'Upload interrupted. Check Gallery before retrying; the image may already be saved.',
    ratio: 'Ratio',
    gallery: 'Gallery',
    drag: 'Drag',
    alignCapture: 'Align item and tap capture',
    openingCamera: 'Opening camera',
    resolutionChanged: 'Resolution set to',
    resolutionFailed: 'Unable to change resolution',
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
    resolutionChanged: '\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e04\u0e27\u0e32\u0e21\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e40\u0e1b\u0e47\u0e19',
    resolutionFailed: '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e04\u0e27\u0e32\u0e21\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e44\u0e14\u0e49',
    saveTo: 'บันทึกที่',
    cameraSettings: 'ตั้งค่ากล้อง',
    language: 'ภาษา',
    resolution: 'ขนาดภาพที่บันทึก',
    quality: 'คุณภาพภาพ',
    qualityHigh: 'คมชัดสูง',
    qualityBalanced: 'สมดุล',
    qualitySmall: 'ไฟล์เล็ก',
    outputHelp: 'ภาพที่บันทึกจะตรงกับขนาดที่เลือก ขนาดไฟล์ขึ้นอยู่กับรายละเอียดภาพ',
    nativePhoto: 'ภาพจากกล้อง',
    videoPhoto: 'ภาพสำรองจากวิดีโอ',
    enlarged: 'ขยายจากภาพต้นฉบับที่เล็กกว่า รายละเอียดอาจไม่เต็มความละเอียด',
    reviewPhoto: 'ตรวจสอบภาพก่อนบันทึก',
    savedTo: 'บันทึกไปที่',
    captureCancelled: 'ยกเลิกการถ่ายภาพแล้ว',
    uploading: 'กำลังส่งภาพ',
    ratioChanged: 'เปลี่ยนอัตราส่วนเป็น',
    cameraUnavailable: 'กล้องไม่พร้อมใช้งาน กดสลับกล้องเพื่อลองอีกครั้ง',
    requestFailed: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    uploadUncertain: 'การส่งภาพขาดการเชื่อมต่อ ตรวจสอบในรูปภาพก่อนลองใหม่ เพราะอาจบันทึกแล้ว',
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
  return CaptureUtils.outputSize(state.selectedRatio, state.selectedResolution);
}

function getCameraResolutionPreset() {
  // Keep one 4:3 sensor framing for every output ratio. The final crop is
  // handled by the on-screen guide, so changing ratio does not change FOV.
  return { width: 2560, height: 1920 };
}

function getRatioAspect() {
  const [width, height] = state.selectedRatio.split(':').map(Number);
  return width / height;
}

function setGuideAspect() {
  const aspect = getRatioAspect();
  cameraShell.style.setProperty('--guide-aspect', String(aspect));
  const rect = video.getBoundingClientRect();
  const fullFrame = Math.abs(rect.width / rect.height - aspect) < 0.001;
  const width = fullFrame ? rect.width : Math.min(Math.max(1, rect.width - 32), Math.max(1, rect.height - 220) * aspect);
  cropGuide.style.width = `${width}px`;
  cropGuide.style.height = `${width / aspect}px`;
  cropGuide.classList.toggle('is-hidden-guide', fullFrame);
}

function savePreferences() {
  try {
    localStorage.setItem('pda-camera-settings', JSON.stringify({
      ratio: state.selectedRatio, resolution: state.selectedResolution,
      quality: state.quality, destination: destinationSelect.value
    }));
  } catch { /* Camera capture also works with storage disabled. */ }
}

function cameraBusy() {
  return state.cameraOpening || state.captureInFlight || state.uploadInFlight;
}

function updateCameraControls() {
  const busy = cameraBusy();
  const reviewing = Boolean(state.capturedBlob);
  captureBtn.disabled = busy || reviewing || state.stream?.getVideoTracks()[0]?.readyState !== 'live';
  for (const control of [switchBtn, resolutionSelect, ratioSelect, qualitySelect, destinationSelect, settingsBtn]) {
    control.disabled = busy || reviewing;
  }
  galleryBtn.disabled = busy;
  zoomSlider.disabled = busy || reviewing || Number(zoomSlider.max) <= Number(zoomSlider.min);
  zoomValue.disabled = zoomSlider.disabled;
  confirmBtn.disabled = busy || !reviewing;
  cancelBtn.disabled = busy;
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

function scheduleLiveHintFade() {
  clearTimeout(liveHintFadeTimer);
  messageOverlay.classList.remove('is-fading');

  if (!liveHint.textContent.trim() || liveHint.classList.contains('hidden')) {
    return;
  }

  liveHintFadeTimer = setTimeout(() => {
    messageOverlay.classList.add('is-fading');
  }, 3200);
}

const liveHintObserver = new MutationObserver(scheduleLiveHintFade);
liveHintObserver.observe(liveHint, {
  childList: true,
  characterData: true,
  subtree: true
});

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
  state.capturedDestination = '';
  preview.removeAttribute('src');
  captureStats.textContent = 'No image';
  serverResult.textContent = '';
  captureSource.textContent = '';
  setPreviewMode(false);
  updateCameraControls();
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
  updateCameraControls();
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

  if (!capabilities || typeof capabilities.zoom !== 'object') {
    return false;
  }

  const min = Number(capabilities.zoom.min ?? 1);
  const max = Number(capabilities.zoom.max ?? zoom);
  const value = Math.min(max, Math.max(min, zoom));

  const constraints = track.getConstraints?.() || {};
  await track.applyConstraints({ ...constraints, advanced: [{ zoom: value }] });
  if (state.stream?.getVideoTracks()[0] !== track) return false;
  state.zoom = value;
  updateZoomControl();
  return true;
}

async function resetCameraZoom() {
  if (zoomResetInFlight || cameraBusy()) {
    return;
  }

  zoomResetInFlight = true;
  try {
    await openCamera(state.activeDeviceId, true);
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
  if (cameraBusy() || zoomResetInFlight || state.capturedBlob || zoomSlider.disabled) return;
  const min = Number(zoomSlider.min);
  const max = Number(zoomSlider.max);
  pendingZoom = Math.min(max, Math.max(min, Math.round(value * 10) / 10));
  setZoomDisplay(pendingZoom);

  if (zoomFrameRequest) {
    return;
  }

  zoomFrameRequest = requestAnimationFrame(() => {
    zoomFrameRequest = 0;
    const value = pendingZoom;
    const revision = ++zoomRevision;
    zoomOperation = zoomOperation.then(async () => {
      if (revision !== zoomRevision || value <= 1 || state.cameraOpening) return;
      await applyZoom(value);
    }).catch((error) => {
      console.error(error);
      liveHint.textContent = 'Unable to change zoom';
    });
  });
}

function getPointerDistance() {
  const pointers = [...activePointers.values()];
  if (pointers.length < 2) {
    return 0;
  }
  return Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
}

async function openCamera(deviceId, resetZoom = false) {
  if (cameraBusy()) return;
  state.cameraOpening = true;
  updateCameraControls();
  zoomRevision++;
  if (zoomFrameRequest) cancelAnimationFrame(zoomFrameRequest);
  zoomFrameRequest = 0;
  activePointers.clear();
  try {
    await zoomOperation;
    if (resetZoom) {
      state.zoom = 1;
      pendingZoom = 1;
    }
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
        frameRate: { ideal: 24, max: 30 }
      }
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    } else {
      constraints.video.facingMode = 'environment';
    }

    let expired = false;
    let openingTimer;
    try {
      const opening = navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        if (expired) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error(translate('cameraUnavailable'));
        }
        return stream;
      });
      state.stream = await Promise.race([opening, new Promise((_, reject) => {
        openingTimer = setTimeout(() => reject(new Error(translate('cameraUnavailable'))), 20000);
      })]);
    } finally {
      expired = true;
      clearTimeout(openingTimer);
    }
    const activeTrack = state.stream.getVideoTracks()[0];
    state.activeDeviceId = activeTrack.getSettings?.()?.deviceId || deviceId || '';
    nativeCaptureDisabled = false;
    activeTrack.addEventListener('ended', () => {
      if (state.stream?.getVideoTracks()[0] !== activeTrack) return;
      updateCameraControls();
      setStatus('Camera stopped', 'error');
      liveHint.textContent = translate('cameraUnavailable');
    });
    video.srcObject = state.stream;
    await video.play();
    await listVideoDevices();
    const activeIndex = state.devices.findIndex((device) => device.deviceId === state.activeDeviceId);
    if (activeIndex >= 0) {
      state.currentDeviceIndex = activeIndex;
    }
    updateZoomControl();
    if (!deviceInfoPanel.classList.contains('hidden')) {
      renderDeviceInfo();
    }
    if (state.zoom !== 1) {
      await applyZoom(state.zoom);
    }
    pendingZoom = state.zoom;
    setGuideAspect();
    setStatus('Camera Ready', 'active');
    liveHint.textContent = translate('alignCapture');
  } catch (error) {
    await stopCamera();
    throw error;
  } finally {
    state.cameraOpening = false;
    updateCameraControls();
  }
}

function nextDeviceId() {
  if (state.devices.length === 0) {
    return null;
  }

  const activeIndex = state.devices.findIndex((device) => device.deviceId === state.activeDeviceId);
  const currentIndex = activeIndex >= 0 ? activeIndex : state.currentDeviceIndex;
  state.currentDeviceIndex = (currentIndex + 1) % state.devices.length;
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

async function captureNativePhoto() {
  const track = state.stream?.getVideoTracks()[0];
  if (nativeCaptureDisabled || !track || typeof window.ImageCapture !== 'function' || typeof window.createImageBitmap !== 'function') {
    return null;
  }

  let expired = false;
  let timer;
  try {
    const imageCapture = new window.ImageCapture(track);
    const capture = (async () => {
      let options;
      try {
        const capabilities = await imageCapture.getPhotoCapabilities();
        if (Number.isFinite(capabilities.imageWidth?.max)) {
          options = { imageWidth: capabilities.imageWidth.max };
        }
      } catch { /* Some cameras only support the default photo size. */ }
      if (expired) return null;
      let blob;
      try {
        blob = await imageCapture.takePhoto(options);
      } catch (error) {
        if (!options || expired) throw error;
        blob = await imageCapture.takePhoto();
      }
      if (expired) return null;
      const bitmap = await window.createImageBitmap(blob);
      if (expired) {
        bitmap.close();
        return null;
      }
      return bitmap;
    })();
    return await Promise.race([capture, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Photo capture timed out')), 8000);
    })]);
  } catch (error) {
    // Some Android camera implementations expose ImageCapture but reject
    // takePhoto. The video stream remains a reliable fallback.
    console.warn('Native photo capture unavailable, using video frame', error);
    nativeCaptureDisabled = true;
    return null;
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}

function drawFrameToCanvas(source = video, sourceWidth = video.videoWidth, sourceHeight = video.videoHeight, cropRect = null) {

  if (!sourceWidth || !sourceHeight) {
    throw new Error('video is not ready');
  }

  const crop = cropRect || getSourceCropRect(sourceWidth, sourceHeight);
  const { offsetX, offsetY, cropWidth, cropHeight } = crop;

  const { width: targetWidth, height: targetHeight } = getResolutionPreset();

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  return { width: targetWidth, height: targetHeight,
    enlarged: cropWidth + 1 < targetWidth || cropHeight + 1 < targetHeight };
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
  // Freeze the fallback before awaiting the native shutter. Layout and
  // zoom are locked until the final JPEG is ready.
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const crop = getSourceCropRect(sourceWidth, sourceHeight);
  let frameSize = drawFrameToCanvas(video, sourceWidth, sourceHeight, crop);
  let sourceLabel = translate('videoPhoto');
  let sourceSize = `${sourceWidth}x${sourceHeight}`;
  const nativePhoto = await captureNativePhoto();
  if (nativePhoto) {
    try {
      const mapped = CaptureUtils.mapCrop(crop, sourceWidth, sourceHeight, nativePhoto.width, nativePhoto.height);
      if (mapped && mapped.cropWidth >= crop.cropWidth && mapped.cropHeight >= crop.cropHeight) {
        frameSize = drawFrameToCanvas(nativePhoto, nativePhoto.width, nativePhoto.height, mapped);
        sourceLabel = translate('nativePhoto');
        sourceSize = `${nativePhoto.width}x${nativePhoto.height}`;
      }
    } finally {
      nativePhoto.close();
    }
  }

  const { width, height } = frameSize;
  const blob = await canvasToBlob(state.quality);

  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }

  state.previewUrl = URL.createObjectURL(blob);
  preview.src = state.previewUrl;
  captureStats.textContent = `${width}x${height} | ${formatBytes(blob.size)}`;
  captureSource.textContent = `${sourceLabel} ${sourceSize}${frameSize.enlarged ? ` | ${translate('enlarged')}` : ''}`;
  serverResult.textContent = `${translate('reviewPhoto')} | ${state.capturedDestination}`;

  return blob;
}

async function uploadCapture(blob) {
  const extension = '.jpg';
  const filename = `capture_${Date.now()}${extension}`;
  const formData = new FormData();
  formData.append('destination', state.capturedDestination);
  formData.append('image', blob, filename);

  return fetchJson('/api/upload', {
    method: 'POST',
    body: formData
  });

}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      throw Object.assign(new Error(result?.message || translate('requestFailed')), { statusCode: response.status });
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) {
      throw new Error(translate(url === '/api/upload' ? 'uploadUncertain' : 'requestFailed'));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function setGalleryOpen(enabled) {
  if (enabled && cameraBusy()) return;
  galleryPanel.classList.toggle('hidden', !enabled);
  if (enabled) {
    galleryDestinationSelect.value = destinationSelect.value;
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
  galleryDeleteSelectedBtn.disabled = galleryDeleting || selectedCount === 0;
  gallerySelectAllBtn.disabled = galleryDeleting;
  galleryDestinationSelect.disabled = galleryDeleting;
  galleryRefreshBtn.disabled = galleryDeleting;
  for (const control of galleryGrid.querySelectorAll('button, input')) control.disabled = galleryDeleting;
  gallerySelectAllBtn.textContent = galleryImages.length > 0 && selectedCount === galleryImages.length
    ? translate('deselectAll')
    : translate('selectAll');
}

async function loadGallery() {
  const requestId = ++galleryRequestId;
  const destination = galleryDestinationSelect.value;
  selectedGalleryImages.clear();
  galleryImages = [];
  updateGallerySelectionUI();
  galleryStatus.textContent = 'Loading';
  galleryGrid.replaceChildren();

  try {
    const result = await fetchJson(`/api/images?destination=${encodeURIComponent(destination)}`);
    if (requestId !== galleryRequestId) return;

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
    if (requestId === galleryRequestId) galleryStatus.textContent = error.message;
  }
}

async function deleteGalleryImage(destination, filename) {
  if (galleryDeleting) return;
  if (!window.confirm(`Delete ${filename}?`)) {
    return;
  }

  try {
    await deleteGalleryImages(destination, [filename]);
    await loadGallery();
  } catch (error) {
    console.error(error);
    await loadGallery();
    galleryStatus.textContent = error.message;
  }
}

async function deleteGalleryImages(destination, filenames) {
  if (galleryDeleting) return;
  galleryDeleting = true;
  updateGallerySelectionUI();
  try {
    for (const filename of filenames) {
      try {
        await fetchJson(`/api/images/${encodeURIComponent(destination)}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      } catch (error) {
        if (error.statusCode !== 404) throw error;
      }
    }
  } finally {
    galleryDeleting = false;
    updateGallerySelectionUI();
  }
}

async function handleCapture() {
  if (cameraBusy() || state.capturedBlob || state.stream?.getVideoTracks()[0]?.readyState !== 'live') {
    return;
  }

  state.captureInFlight = true;
  state.capturedDestination = destinationSelect.value;
  updateCameraControls();
  setSettingsOpen(false);
  activePointers.clear();
  if (zoomFrameRequest) cancelAnimationFrame(zoomFrameRequest);
  zoomFrameRequest = 0;
  setStatus('Compressing', 'warn');

  try {
    await zoomOperation;
    if (pendingZoom > 1 && pendingZoom !== state.zoom) await applyZoom(pendingZoom);
    state.capturedBlob = await compressCapture();
    setPreviewMode(true);
    setStatus('Preview', 'warn');
  } catch (error) {
    console.error(error);
    setStatus('Error', 'error');
    liveHint.textContent = error.message;
  } finally {
    state.captureInFlight = false;
    updateCameraControls();
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
  serverResult.textContent = translate('uploading');
  updateCameraControls();

  try {
    const result = await uploadCapture(state.capturedBlob);
    setStatus('Uploaded', 'active');
    serverResult.textContent = `${result.destination} | ${result.filename}`;
    clearPreview();
    liveHint.textContent = `${translate('savedTo')} ${result.destination}`;
  } catch (error) {
    console.error(error);
    setStatus('Error', 'error');
    serverResult.textContent = error.message;
    cancelBtn.disabled = false;
  } finally {
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    state.uploadInFlight = false;
    updateCameraControls();
  }
}

captureBtn.addEventListener('click', handleCapture);
confirmBtn.addEventListener('click', handleConfirm);
cancelBtn.addEventListener('click', () => {
  clearPreview();
  setStatus('Camera Ready', 'active');
  liveHint.textContent = translate('captureCancelled');
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
  try { localStorage.setItem('pda-camera-language', state.language); } catch { /* Optional preference. */ }
  applyLanguage();
  if (!deviceInfoPanel.classList.contains('hidden')) renderDeviceInfo();
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
  if (galleryDeleting) return;
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
    await loadGallery();
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
  if (cameraBusy() || state.capturedBlob) return;
  try {
    const deviceId = nextDeviceId();
    await openCamera(deviceId, true);
  } catch (error) {
    console.error(error);
    setStatus('Switch Failed', 'error');
    liveHint.textContent = error.message;
  }
});

resolutionSelect.addEventListener('change', async () => {
  if (cameraBusy() || state.capturedBlob) return;
  state.selectedResolution = resolutionSelect.value;
  savePreferences();
  liveHint.textContent = `${translate('resolutionChanged')} ${resolutionSelect.value}`;
});

ratioSelect.addEventListener('change', async () => {
  if (cameraBusy() || state.capturedBlob) return;
  const presetIndex = RATIO_PRESETS[state.selectedRatio].indexOf(state.selectedResolution);
  state.selectedRatio = ratioSelect.value;
  state.selectedResolution = RATIO_PRESETS[state.selectedRatio][Math.max(0, presetIndex)];
  syncResolutionOptions();
  setGuideAspect();
  savePreferences();
  liveHint.textContent = `${translate('ratioChanged')} ${state.selectedRatio} | ${state.selectedResolution}`;
});

qualitySelect.addEventListener('change', () => {
  state.quality = Number(qualitySelect.value);
  savePreferences();
});
destinationSelect.addEventListener('change', savePreferences);

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
  let savedLanguage;
  try {
    savedLanguage = localStorage.getItem('pda-camera-language');
    const saved = JSON.parse(localStorage.getItem('pda-camera-settings') || '{}');
    if (RATIO_PRESETS[saved.ratio]?.includes(saved.resolution)) {
      state.selectedRatio = saved.ratio;
      state.selectedResolution = saved.resolution;
    }
    if ([0.9, 0.82, 0.72].includes(saved.quality)) state.quality = saved.quality;
    if (['Inbound', 'Return', 'Outbound', 'Other'].includes(saved.destination)) destinationSelect.value = saved.destination;
  } catch { /* Ignore invalid or unavailable saved preferences. */ }
  qualitySelect.value = String(state.quality);
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

window.addEventListener('resize', setGuideAspect);
video.addEventListener('loadedmetadata', setGuideAspect);
window.addEventListener('pagehide', () => {
  zoomRevision++;
  if (zoomFrameRequest) cancelAnimationFrame(zoomFrameRequest);
  clearTimeout(liveHintFadeTimer);
  stopCamera();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !state.stream) {
    openCamera(state.activeDeviceId).catch((error) => {
      liveHint.textContent = error.message;
    });
  }
});
