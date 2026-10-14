(function () {
  'use strict';

  var INTEREST_KEY = 'tems-interested';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function api(path, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: { Accept: 'application/json' } };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed (' + res.status + ').');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  // Hero call to action
  document.getElementById('cta-btn').addEventListener('click', function () {
    location.hash = '#contact';
    document.getElementById('name').focus({ preventScroll: true });
  });

  // Interest counter (shared across all visitors via the API)
  var interestBtn = document.getElementById('interest-btn');
  var interestCount = document.getElementById('interest-count');

  function markInterested() {
    interestBtn.disabled = true;
    interestBtn.textContent = 'Thanks for your interest';
  }

  if (storageGet(INTEREST_KEY)) markInterested();

  api('/api/interest')
    .then(function (data) { interestCount.textContent = data.count; })
    .catch(function () { /* keep the default 0 if the API is unreachable */ });

  interestBtn.addEventListener('click', function () {
    interestBtn.disabled = true;
    api('/api/interest', { method: 'POST' })
      .then(function (data) {
        interestCount.textContent = data.count;
        storageSet(INTEREST_KEY, '1');
        markInterested();
      })
      .catch(function () {
        interestBtn.disabled = false;
      });
  });

  // Application form
  var form = document.getElementById('signup-form');
  var status = document.getElementById('form-status');
  var submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var payload = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      year: form.elements.year.value,
      message: form.elements.message.value.trim()
    };

    if (!payload.name) {
      status.textContent = 'Please enter your name.';
      form.elements.name.focus();
      return;
    }
    if (!EMAIL_RE.test(payload.email)) {
      status.textContent = 'Please enter a valid email address.';
      form.elements.email.focus();
      return;
    }

    submitBtn.disabled = true;
    status.textContent = 'Sending…';

    api('/api/applications', { method: 'POST', body: payload })
      .then(function () {
        status.textContent = 'Thanks, ' + payload.name + '! Your application has been received.';
        form.reset();
      })
      .catch(function (err) {
        status.textContent = err.status
          ? err.message
          : 'Could not reach the server. Please try again later.';
      })
      .then(function () {
        submitBtn.disabled = false;
      });
  });
})();
