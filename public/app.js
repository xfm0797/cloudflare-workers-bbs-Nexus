/* cf-bbs — progressive enhancement (no dependencies) */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------------------------------------------------------------- utils */

  function csrf() {
    var m = document.cookie.match(/(?:^|;\s*)bbs_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function toast(message, type) {
    if (!message) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('is-visible');
    });
    setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () {
        el.remove();
      }, 220);
    }, 2200);
  }

  function postForm(form, extraHeaders) {
    var body = new FormData(form);
    var headers = Object.assign(
      { accept: 'application/json', 'x-csrf-token': csrf() },
      extraHeaders || {},
    );
    return fetch(form.action, { method: 'POST', body: body, headers: headers, credentials: 'same-origin' });
  }

  /* ---------------------------------------------------------------- theme */

  function applyTheme(mode) {
    if (mode === 'light' || mode === 'dark') {
      root.setAttribute('data-theme', mode);
    } else {
      root.removeAttribute('data-theme');
    }
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) {
      var dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      meta.setAttribute('content', dark ? '#090c12' : '#ffffff');
    }
  }

  function currentTheme() {
    try {
      var v = localStorage.getItem('cfbbs-theme');
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    e.preventDefault();
    var order = ['system', 'light', 'dark'];
    var next = order[(order.indexOf(currentTheme()) + 1) % order.length];
    try {
      if (next === 'system') localStorage.removeItem('cfbbs-theme');
      else localStorage.setItem('cfbbs-theme', next);
    } catch (err) {}
    applyTheme(next);
    toast(next === 'system' ? '跟随系统 / System' : next === 'light' ? '浅色模式' : '深色模式');
  });

  /* ---------------------------------------------------------------- mobile nav */

  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-nav-toggle]');
    if (!toggle) return;
    var menu = document.getElementById('mobileMenu');
    if (!menu) return;
    var open = menu.hasAttribute('hidden');
    if (open) menu.removeAttribute('hidden');
    else menu.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* ---------------------------------------------------------------- dropdowns */

  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.dropdown[open], details.report-menu[open]').forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('details[open]').forEach(function (d) {
        d.removeAttribute('open');
      });
    }
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      var input = document.querySelector('.header-search input, .mobile-search input, .search-big input');
      if (input) {
        e.preventDefault();
        input.focus();
      }
    }
  });

  /* ---------------------------------------------------------------- likes */

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form.like-form');
    if (!form || !window.fetch) return;
    e.preventDefault();
    postForm(form)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) {
          if (data.error === 'unauthorized') location.href = '/login';
          return;
        }
        form.classList.toggle('is-liked', data.liked);
        var count = form.querySelector('.like-count');
        if (count) count.textContent = data.count;
      })
      .catch(function () {});
  });

  /* ---------------------------------------------------------------- bookmark */

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-bookmark]');
    if (!form || !window.fetch) return;
    e.preventDefault();
    postForm(form)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        form.classList.toggle('is-active', data.bookmarked);
        var label = form.querySelector('.bookmark-label');
        if (label) {
          label.textContent = data.bookmarked
            ? label.getAttribute('data-on') || '已收藏'
            : label.getAttribute('data-off') || '收藏';
        }
      })
      .catch(function () {});
  });

  /* ---------------------------------------------------------------- confirm */

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-confirm]');
    if (!form) return;
    if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
  });

  /* ---------------------------------------------------------------- share */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-share]');
    if (!btn) return;
    var url = btn.getAttribute('data-share');
    if (navigator.share) {
      navigator.share({ url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        function () {
          toast('链接已复制 / Link copied');
        },
        function () {},
      );
    }
  });

  /* ---------------------------------------------------------------- composer */

  function updateCounter(el) {
    var target = document.querySelector('[data-counter-for="' + el.id + '"]');
    if (!target) return;
    var max = el.getAttribute('maxlength') || '20000';
    target.textContent = el.value.length + ' / ' + max;
  }

  document.querySelectorAll('textarea[maxlength]').forEach(function (el) {
    updateCounter(el);
    el.addEventListener('input', function () {
      updateCounter(el);
    });
  });

  // 引用回复
  var replyBox = document.getElementById('replyContent');
  var quoteBar = document.getElementById('quoteBar');
  var quoteText = document.getElementById('quoteText');
  var replyToInput = document.getElementById('replyToInput');

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-quote-post]');
    if (!btn || !replyBox) return;
    e.preventDefault();
    var user = btn.getAttribute('data-quote-user');
    var postId = btn.getAttribute('data-quote-post');
    replyBox.value = '> @' + user + ' \n\n' + replyBox.value;
    if (replyToInput) replyToInput.value = postId;
    if (quoteBar && quoteText) {
      quoteText.textContent = '正在回复 @' + user;
      quoteBar.removeAttribute('hidden');
    }
    replyBox.focus();
    replyBox.setSelectionRange(replyBox.value.length, replyBox.value.length);
    updateCounter(replyBox);
    var form = document.getElementById('replyForm');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-quote-clear]')) return;
    if (quoteBar) quoteBar.setAttribute('hidden', '');
    if (replyToInput) replyToInput.value = '';
  });

  if (replyBox) {
    replyBox.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        var form = document.getElementById('replyForm');
        if (form) form.requestSubmit();
      }
    });
  }

  /* ---------------------------------------------------------------- markdown toolbar */

  function wrapSelection(el, before, after) {
    var start = el.selectionStart;
    var end = el.selectionEnd;
    var selected = el.value.slice(start, end) || '';
    el.value = el.value.slice(0, start) + before + selected + after + el.value.slice(end);
    el.selectionStart = start + before.length;
    el.selectionEnd = start + before.length + selected.length;
    el.dispatchEvent(new Event('input'));
    el.focus();
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-markdown]');
    if (!btn) return;
    var el = document.getElementById('content');
    if (!el) return;
    e.preventDefault();
    var kind = btn.getAttribute('data-markdown');
    if (kind === 'bold') wrapSelection(el, '**', '**');
    if (kind === 'code') wrapSelection(el, '`', '`');
    if (kind === 'quote') wrapSelection(el, '> ', '');
    if (kind === 'list') wrapSelection(el, '- ', '');
  });

  // 实时预览
  var previewBtn = document.querySelector('[data-preview-toggle]');
  if (previewBtn) {
    previewBtn.addEventListener('click', function () {
      var area = document.getElementById('content');
      var box = document.getElementById('previewBox');
      if (!area || !box) return;
      if (!box.hasAttribute('hidden')) {
        box.setAttribute('hidden', '');
        area.removeAttribute('hidden');
        return;
      }
      var fd = new FormData();
      fd.append('content', area.value);
      fd.append('_csrf', csrf());
      fetch('/api/preview', { method: 'POST', body: fd, headers: { accept: 'application/json' } })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data.ok) return;
          box.innerHTML = data.html || '<p class="muted">—</p>';
          box.removeAttribute('hidden');
          area.setAttribute('hidden', '');
        })
        .catch(function () {});
    });
  }

  /* ---------------------------------------------------------------- auto-grow */

  document.querySelectorAll('textarea.auto-grow').forEach(function (el) {
    var resize = function () {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 420) + 'px';
    };
    el.addEventListener('input', resize);
    resize();
  });
})();
