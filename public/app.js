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
    var el = btn.closest('form') ? btn.closest('form').querySelector('textarea') : document.getElementById('content');
    if (!el) return;
    e.preventDefault();
    var kind = btn.getAttribute('data-markdown');
    if (kind === 'bold') wrapSelection(el, '**', '**');
    if (kind === 'code') wrapSelection(el, '`', '`');
    if (kind === 'quote') wrapSelection(el, '> ', '');
    if (kind === 'list') wrapSelection(el, '- ', '');
  });

  /* ---------------------------------------------------------------- image upload */

  // 服务端上限见 IMGBED_MAX_MB，这里只做提前提示
  var IMG_MAX_MB = 8;

  function composerTarget(node) {
    var form = node.closest('form');
    return form ? form.querySelector('textarea') : document.getElementById('content');
  }

  function insertText(el, text) {
    if (el.maxLength > 0 && el.value.length + text.length + 2 > el.maxLength) {
      toast('内容超出长度上限 / Content too long', 'error');
      return false;
    }
    var start = el.selectionStart == null ? el.value.length : el.selectionStart;
    var end = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    var head = el.value.slice(0, start);
    var tail = el.value.slice(end);
    var lead = head && !/\n$/.test(head) ? '\n' : '';
    var block = lead + text + '\n';
    el.value = head + block + tail;
    var pos = (head + block).length;
    el.selectionStart = el.selectionEnd = pos;
    el.dispatchEvent(new Event('input'));
    el.focus();
    return true;
  }

  function uploadErrorText(data) {
    var map = {
      unauthorized: '请先登录 / Please sign in',
      not_configured: '图床未配置 / Image host not configured',
      no_file: '没有选择文件 / No file selected',
      too_large: '图片超过 ' + (data.maxMb || IMG_MAX_MB) + 'MB / Image too large',
      bad_type: '仅支持图片 / Images only',
      auth: '图床认证失败，请检查认证码 / Image host auth failed',
      timeout: '上传超时，请重试 / Upload timed out',
      rate_limited: '上传太频繁，请稍后再试 / Too many uploads',
      upstream: '图床返回异常 / Image host error',
    };
    return map[data.error] || '上传失败 / Upload failed';
  }

  function uploadOne(file, el) {
    if (!/^image\//.test(file.type || '')) {
      toast('仅支持图片 / Images only', 'error');
      return Promise.resolve();
    }
    if (file.size > IMG_MAX_MB * 1024 * 1024) {
      toast('图片超过 ' + IMG_MAX_MB + 'MB / Image too large', 'error');
      return Promise.resolve();
    }
    var fd = new FormData();
    fd.append('file', file);
    return fetch('/api/upload', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'x-csrf-token': csrf() },
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return { ok: false, error: 'upstream' };
          });
      })
      .then(function (data) {
        if (!data.ok) {
          toast(uploadErrorText(data), 'error');
          return;
        }
        if (insertText(el, data.markdown || '![](' + data.url + ')')) {
          toast('已插入图片 / Image inserted');
        }
      })
      .catch(function () {
        toast('上传失败，请检查网络 / Upload failed', 'error');
      });
  }

  function uploadImages(files, el, btn) {
    var list = [];
    for (var i = 0; i < files.length; i++) {
      if (files[i] && /^image\//.test(files[i].type || '')) list.push(files[i]);
    }
    if (!list.length) {
      toast('仅支持图片 / Images only', 'error');
      return;
    }
    if (btn) btn.disabled = true;
    toast(list.length > 1 ? '正在上传 ' + list.length + ' 张… / Uploading' : '正在上传… / Uploading');
    // 串行上传，保证 markdown 顺序与选择顺序一致
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        return uploadOne(file, el);
      });
    });
    chain.then(function () {
      if (btn) btn.disabled = false;
    });
  }

  function pickImages(el, btn) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var files = input.files || [];
      uploadImages(files, el, btn);
      input.remove();
    });
    input.click();
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-image-upload]');
    if (!btn) return;
    e.preventDefault();
    var el = composerTarget(btn);
    if (el) pickImages(el, btn);
  });

  // 粘贴 / 拖拽：只在带上传入口的编辑框上启用
  document.querySelectorAll('form textarea').forEach(function (el) {
    var form = el.closest('form');
    var btn = form ? form.querySelector('[data-image-upload]') : null;
    if (!btn) return;

    el.addEventListener('paste', function (ev) {
      var data = ev.clipboardData;
      if (!data) return;
      var files = [];
      for (var i = 0; i < data.items.length; i++) {
        var item = data.items[i];
        if (item.kind === 'file') {
          var f = item.getAsFile();
          if (f && /^image\//.test(f.type || '')) files.push(f);
        }
      }
      if (!files.length) return;
      ev.preventDefault();
      uploadImages(files, el, null);
    });

    el.addEventListener('dragover', function (ev) {
      if (!ev.dataTransfer) return;
      ev.preventDefault();
      el.classList.add('is-drop');
    });
    el.addEventListener('dragleave', function () {
      el.classList.remove('is-drop');
    });
    el.addEventListener('drop', function (ev) {
      if (!ev.dataTransfer) return;
      el.classList.remove('is-drop');
      var files = ev.dataTransfer.files;
      if (!files || !files.length) return;
      ev.preventDefault();
      uploadImages(files, el, null);
    });
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

  /* ---------------------------------------------------------------- 草稿自动保存 */

  // 规则：/new 页的标题+正文、主题回复框、私信输入框，按路径维度存 localStorage
  var draftTargets = [];
  var newContent = document.getElementById('content');
  var newTitle = document.getElementById('title');
  if (newContent && newTitle) {
    draftTargets.push([newTitle, 'cfbbs-draft:new:title']);
    draftTargets.push([newContent, 'cfbbs-draft:new:content']);
  }
  var replyBox = document.getElementById('replyContent');
  var topicMatch = location.pathname.match(/^\/t\/(\d+)/);
  if (replyBox && topicMatch) draftTargets.push([replyBox, 'cfbbs-draft:reply:' + topicMatch[1]]);
  document.querySelectorAll('.dm-compose textarea[name="body"]').forEach(function (el) {
    draftTargets.push([el, 'cfbbs-draft:dm:' + location.pathname]);
  });

  draftTargets.forEach(function (pair) {
    var el = pair[0];
    var key = pair[1];
    var timer = null;

    try {
      var saved = localStorage.getItem(key);
      if (saved && !el.value) {
        el.value = saved;
        el.dispatchEvent(new Event('input', { bubbles: false }));
      }
    } catch (e) {}

    el.addEventListener('input', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        try {
          if (el.value.trim()) localStorage.setItem(key, el.value);
          else localStorage.removeItem(key);
        } catch (e) {}
      }, 600);
    });

    // 提交成功即清除（跟随表单提交；失败时刷新会恢复）
    if (el.form) {
      el.form.addEventListener('submit', function () {
        try {
          localStorage.removeItem(key);
        } catch (e) {}
      });
    }
  });

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
