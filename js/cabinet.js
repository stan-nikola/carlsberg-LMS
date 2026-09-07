// Renders the post-login cabinet (avatar, greeting, XP/stats placeholders,
// profile detail rows) from a profile object. Pure DOM writes — no state of
// its own, so it's safe to call again any time `profile` changes.

import { initials } from './helpers.js';

export function renderCabinet(profile) {
  if (!profile) return;
  var name = profile.name || '';
  var initEl = initials(name);
  document.getElementById('avatarInitials').textContent = initEl;
  document.getElementById('avatarInitialsProfile').textContent = initEl;
  document.getElementById('profileNameHome').textContent = name || '—';
  document.getElementById('profileNameProfile').textContent = name || '—';
  var metaTxt = (profile.userId || '').toUpperCase();
  document.getElementById('profileMetaHome').textContent = metaTxt;
  document.getElementById('profileMetaProfile').textContent = metaTxt;

  var hour = new Date().getHours();
  var greet = hour < 12 ? 'Доброго ранку' : hour < 18 ? 'Доброго дня' : 'Доброго вечора';
  document.getElementById('greetingKicker').textContent = greet.toUpperCase();
  document.getElementById('greetingName').textContent = name ? ('Вітаємо, ' + name.split(' ')[0] + '!') : greet + '!';

  // Курсів поки немає — XP/рівень/статистика стоять на базовому старті,
  // доки не з'явиться перший курс.
  document.getElementById('xpNum').textContent = '0 / 200 XP';
  document.getElementById('xpFill').style.width = '0%';
  var levelLabel = 'Новачок';
  document.getElementById('levelLabelHome').textContent = levelLabel;
  document.getElementById('levelLabelProfile').textContent = levelLabel;

  document.getElementById('statCourses').textContent = '0';
  document.getElementById('statScore').textContent = '—';
  document.getElementById('statBadges').textContent = '1';

  document.getElementById('pdUserId').textContent = (profile.userId || '—').toUpperCase();
  document.getElementById('pdSvEmail').textContent = profile.svEmail || '—';
  document.getElementById('pdRegisteredAt').textContent = profile.registeredAt
    ? new Date(profile.registeredAt).toLocaleDateString('uk-UA')
    : '—';
}
