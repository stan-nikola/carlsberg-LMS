// Entry point: loads the saved profile (if any), shows the right screen,
// and wires up the other modules. Loaded as a native ES module — no bundler.

import { initSettings } from './settings.js';
import { initRegistration } from './registration.js';
import { renderCabinet } from './cabinet.js';

(function () {
  var regCard = document.getElementById('regCard');
  var mainCard = document.getElementById('mainCard');

  var profile = null;
  try {
    var raw = localStorage.getItem('telesale_profile_v1');
    if (raw) profile = JSON.parse(raw);
  } catch (e) {}

  function showHome() {
    regCard.style.display = 'none';
    mainCard.style.display = 'flex';
    document.body.classList.remove('pre-registration');
    renderCabinet(profile);
  }

  if (profile && profile.userId) {
    showHome();
  } else {
    document.body.classList.add('pre-registration');
  }

  initSettings();

  initRegistration({
    onLoggedIn: function (newProfile) {
      profile = newProfile;
      showHome();
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    try { localStorage.removeItem('telesale_profile_v1'); } catch (e) {}
    location.reload();
  });

  /* ===================== TABS ===================== */
  var tabbar = document.getElementById('tabbar');
  tabbar.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab-btn'); if (!btn) return;
    var tab = btn.dataset.tab;
    tabbar.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    document.querySelectorAll('.hub-screen').forEach(function (s) { s.classList.toggle('active', s.dataset.tab === tab); });
  });
})();
