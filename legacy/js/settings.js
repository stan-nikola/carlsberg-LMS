// Settings bottom sheet: text-size slider + the sheet's own open/close.
// Persisted key is shared with any future course pages, so text size stays
// in sync platform-wide.

export function initSettings() {
  var FS_SCALES = [1, 1.15, 1.3, 1.45];
  var currentFsStep = 0;
  try {
    var savedFs = parseInt(localStorage.getItem('telesale_fs_step'), 10);
    if (!isNaN(savedFs) && savedFs >= 0 && savedFs <= 3) currentFsStep = savedFs;
  } catch (e) {}
  document.documentElement.style.setProperty('--fs-scale', FS_SCALES[currentFsStep]);

  var fsSlider = document.getElementById('fsSlider');
  fsSlider.value = currentFsStep;
  fsSlider.addEventListener('input', function () {
    currentFsStep = parseInt(fsSlider.value, 10) || 0;
    document.documentElement.style.setProperty('--fs-scale', FS_SCALES[currentFsStep]);
    try { localStorage.setItem('telesale_fs_step', currentFsStep); } catch (e) {}
  });

  var sheetOverlay = document.getElementById('sheetOverlay');
  document.getElementById('settingsBtn').addEventListener('click', function () { sheetOverlay.classList.add('open'); });
  document.getElementById('regSettingsBtn').addEventListener('click', function () { sheetOverlay.classList.add('open'); });
  sheetOverlay.addEventListener('click', function (e) { if (e.target === sheetOverlay) sheetOverlay.classList.remove('open'); });
}
