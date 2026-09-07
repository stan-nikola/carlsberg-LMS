// Renders the post-login cabinet (avatar, greeting, XP/stats, course tiles,
// profile detail rows) from a profile object. Pure DOM writes — no state of
// its own beyond reading each course's own localStorage progress key, so
// it's safe to call again any time `profile` changes or a course finishes.

import { initials } from './helpers.js';

// One entry per course wired into the hub. `screens` is only used to turn a
// mid-course screen index into an approximate progress percentage.
var COURSES = [
  {
    statusKey: 'assort_course_status',
    progressKey: 'assort_progress_v1',
    screens: 26,
    fillIds: ['homeCourseFill', 'learnCourseFill'],
    pctIds: ['homeCoursePct', 'learnCoursePct'],
    wrapIds: ['homeCourseProgressWrap', 'learnCourseProgressWrap'],
    descId: 'homeCourseDesc',
    inProgressDesc: 'Ви вже почали — продовжте з того самого місця.',
    defaultDesc: 'Портфель брендів, формати впаковки та ключові переваги асортименту.'
  }
];

function readCourseStatus(course) {
  try {
    var doneRaw = localStorage.getItem(course.statusKey);
    if (doneRaw) {
      var done = JSON.parse(doneRaw);
      if (done && done.status === 'completed') {
        return { status: 'completed', pct: done.scorePercent || 0, passed: !!done.passed };
      }
    }
    var progRaw = localStorage.getItem(course.progressKey);
    if (progRaw) {
      var prog = JSON.parse(progRaw);
      if (prog && prog.idx > 0) {
        var pct = Math.min(96, Math.round((prog.idx / course.screens) * 100));
        return { status: 'in_progress', pct: pct };
      }
    }
  } catch (e) {}
  return { status: 'not_started', pct: 0 };
}

function renderCourseTile(course, cs) {
  course.fillIds.forEach(function (id, i) {
    var fillEl = document.getElementById(id);
    var pctEl = document.getElementById(course.pctIds[i]);
    var wrapEl = document.getElementById(course.wrapIds[i]);
    if (!wrapEl) return;

    if (cs.status === 'completed') {
      wrapEl.outerHTML =
        '<div class="ct-status-done ' + (cs.passed ? 'is-pass' : 'is-fail') + '" data-role="done-' + id + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
        (cs.passed ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M18 6 6 18M6 6l12 12"/>') +
        '</svg><span></span></div>';
      var doneEl = document.querySelector('[data-role="done-' + id + '"] span');
      if (doneEl) doneEl.textContent = (cs.passed ? 'Залік · ' : 'Незалік · ') + cs.pct + '%';
    } else {
      if (fillEl) fillEl.style.width = cs.pct + '%';
      if (pctEl) pctEl.textContent = cs.pct + '%';
    }
  });

  if (course.descId) {
    var descEl = document.getElementById(course.descId);
    if (descEl) descEl.textContent = cs.status === 'in_progress' ? course.inProgressDesc : course.defaultDesc;
  }
}

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

  var statuses = COURSES.map(readCourseStatus);
  var completedCount = statuses.filter(function (s) { return s.status === 'completed'; }).length;
  var passedCount = statuses.filter(function (s) { return s.status === 'completed' && s.passed; }).length;
  var anyInProgress = statuses.some(function (s) { return s.status === 'in_progress'; });
  var lastCompleted = statuses.filter(function (s) { return s.status === 'completed'; }).slice(-1)[0];

  var xp = completedCount * 100 + (anyInProgress ? 40 : 0);
  var xpMax = 200;
  document.getElementById('xpNum').textContent = Math.min(xp, xpMax) + ' / ' + xpMax + ' XP';
  document.getElementById('xpFill').style.width = Math.min(100, Math.round(xp / xpMax * 100)) + '%';
  var levelLabel = xp >= xpMax ? 'Профі телесейлу' : xp >= 100 ? 'Стажер адаптації' : 'Новачок';
  document.getElementById('levelLabelHome').textContent = levelLabel;
  document.getElementById('levelLabelProfile').textContent = levelLabel;

  document.getElementById('statCourses').textContent = completedCount + '/' + COURSES.length;
  document.getElementById('statScore').textContent = lastCompleted ? (lastCompleted.pct + '%') : '—';
  document.getElementById('statBadges').textContent = String(1 + (passedCount > 0 ? 1 : 0));

  var badgeEl = document.getElementById('badgeCourseDone');
  if (badgeEl) badgeEl.classList.toggle('locked', passedCount === 0);

  COURSES.forEach(function (course, i) { renderCourseTile(course, statuses[i]); });

  document.getElementById('pdUserId').textContent = (profile.userId || '—').toUpperCase();
  document.getElementById('pdSvEmail').textContent = profile.svEmail || '—';
  document.getElementById('pdRegisteredAt').textContent = profile.registeredAt
    ? new Date(profile.registeredAt).toLocaleDateString('uk-UA')
    : '—';
}
