// Registration screen: name + User_Id -> PIN sent to the supervisor's email
// (Email_SV) -> PIN confirmation. Backed by a Google Apps Script Web App
// (see /apps-script/registration.gs for the server side and deploy steps).
//
// Two-step flow, both steps hitting the same REG_WEBHOOK_URL with a
// different `action`:
//   1) action:"register"  { userId, name } -> looks up the row, emails a
//      PIN to Email_SV (static PIN, resending just re-sends the same one).
//   2) action:"confirm"   { userId, name, pin } -> verifies the PIN,
//      records User_Name + last_action, returns svEmail for the profile.
//
// Call initRegistration({ onLoggedIn }) once; onLoggedIn(profile) fires
// after a successful confirm so the caller can persist/display it.

var REG_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzlIiEkJ-xdeHbMjddWxBoQhiK3XiRleF29fIsD16R2P6rZH6XtT8QA6zYY-NKJWi3l/exec';

function postReg(payload) {
  return fetch(REG_WEBHOOK_URL, {
    method: 'POST',
    // text/plain навмисно — щоб запит лишався "simple" і браузер не робив
    // CORS-preflight, який Apps Script не обробляє.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).then(function (r) { return r.json(); });
}

function setFieldError(fieldId, show, msg) {
  var field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.toggle('has-error', !!show);
  if (show && msg) {
    var errEl = field.querySelector('.field-error');
    if (errEl) errEl.textContent = msg;
  }
}

function setBtnBusy(btn, busy) {
  btn.disabled = busy;
  btn.classList.toggle('is-busy', busy);
}

export function initRegistration(opts) {
  var onLoggedIn = (opts && opts.onLoggedIn) || function () {};

  var codeHintOverlay = document.getElementById('codeHintOverlay');
  document.getElementById('codeHintBtn').addEventListener('click', function () { codeHintOverlay.classList.add('open'); });
  codeHintOverlay.addEventListener('click', function (e) { if (e.target === codeHintOverlay) codeHintOverlay.classList.remove('open'); });

  var regStepIdentity = document.getElementById('regStepIdentity');
  var regStepPin = document.getElementById('regStepPin');
  var regSubmitBtn = document.getElementById('regSubmit');
  var regPinSubmitBtn = document.getElementById('regPinSubmit');
  var pendingReg = null; // { userId, name } между кроками register -> confirm

  regSubmitBtn.addEventListener('click', function () {
    var form = document.getElementById('regForm');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var name = document.getElementById('fName').value.trim();
    var userId = document.getElementById('fUserId').value.trim();
    setFieldError('fldUserId', false);
    if (!REG_WEBHOOK_URL) {
      setFieldError('fldUserId', true, 'Реєстрацію ще не підключено до сервера. Зверніться до адміністратора.');
      return;
    }
    setBtnBusy(regSubmitBtn, true);
    postReg({ action: 'register', userId: userId, name: name }).then(function (resp) {
      setBtnBusy(regSubmitBtn, false);
      if (resp && resp.ok) {
        pendingReg = { userId: userId, name: name };
        document.getElementById('fPin').value = '';
        setFieldError('fldPin', false);
        regStepIdentity.classList.remove('active');
        regStepPin.classList.add('active');
        regSubmitBtn.classList.remove('step-active');
        regPinSubmitBtn.classList.add('step-active');
        document.getElementById('fPin').focus();
      } else if (resp && resp.error === 'no_sv_email') {
        setFieldError('fldUserId', true, 'Для цього коду не вказано керівника. Зверніться до адміністратора.');
      } else if (resp && resp.error && resp.error !== 'not_found') {
        // server_error / sheet_not_found / unknown_action тощо — показуємо реальний
        // текст, а не узагальнене "код не знайдено", щоб проблему було видно одразу.
        setFieldError('fldUserId', true, 'Помилка сервера: ' + (resp.message || resp.error));
      } else {
        setFieldError('fldUserId', true, 'Код не знайдено. Перевірте правильність і спробуйте ще раз.');
      }
    }).catch(function () {
      setBtnBusy(regSubmitBtn, false);
      setFieldError('fldUserId', true, "Не вдалося надіслати запит. Перевірте інтернет-з'єднання і спробуйте ще раз.");
    });
  });

  regPinSubmitBtn.addEventListener('click', function () {
    if (!pendingReg) return;
    var pin = document.getElementById('fPin').value.trim();
    setFieldError('fldPin', false);
    if (!pin) { setFieldError('fldPin', true, 'Введіть PIN-код.'); return; }
    setBtnBusy(regPinSubmitBtn, true);
    postReg({ action: 'confirm', userId: pendingReg.userId, name: pendingReg.name, pin: pin }).then(function (resp) {
      setBtnBusy(regPinSubmitBtn, false);
      if (resp && resp.ok) {
        var profile = {
          name: pendingReg.name,
          userId: pendingReg.userId,
          svEmail: resp.svEmail || '',
          registeredAt: new Date().toISOString()
        };
        try { localStorage.setItem('telesale_profile_v1', JSON.stringify(profile)); } catch (e) {}
        pendingReg = null;
        onLoggedIn(profile);
      } else {
        setFieldError('fldPin', true, 'Невірний PIN-код. Спробуйте ще раз.');
      }
    }).catch(function () {
      setBtnBusy(regPinSubmitBtn, false);
      setFieldError('fldPin', true, "Не вдалося надіслати запит. Перевірте інтернет-з'єднання і спробуйте ще раз.");
    });
  });

  document.getElementById('regPinBack').addEventListener('click', function () {
    pendingReg = null;
    regStepPin.classList.remove('active');
    regStepIdentity.classList.add('active');
    regPinSubmitBtn.classList.remove('step-active');
    regSubmitBtn.classList.add('step-active');
  });

  var regPinResendBtn = document.getElementById('regPinResend');
  regPinResendBtn.addEventListener('click', function () {
    if (!pendingReg || regPinResendBtn.disabled) return;
    setBtnBusy(regPinResendBtn, true);
    postReg({ action: 'register', userId: pendingReg.userId, name: pendingReg.name }).then(function (resp) {
      if (resp && resp.ok) {
        var span = regPinResendBtn.querySelector('span') || regPinResendBtn;
        var original = span.textContent;
        span.textContent = 'Надіслано ✓';
        setTimeout(function () { span.textContent = original; regPinResendBtn.disabled = false; }, 20000);
      } else {
        regPinResendBtn.disabled = false;
      }
    }).catch(function () { regPinResendBtn.disabled = false; });
  });
}
