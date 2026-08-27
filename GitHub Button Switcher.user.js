// ==UserScript==
// @name         GitHub Button Switcher
// @namespace    leshugan
// @version      2.1.3
// @description  Actions вместо Agents в шапке, стрелка скачивания артефакта у готовых сборок, стрелка загрузки файла рядом с кнопкой Code
// @match        https://github.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const norm = s => (s || '').trim().toLowerCase();

  const STYLE = `
    .gh-dl-btn, .gh-up-btn {
      transition: background-color .12s ease, transform .08s ease, opacity .12s ease;
    }
    .gh-dl-btn:hover, .gh-up-btn:hover {
      background: var(--bgColor-neutral-muted, rgba(177,186,196,.12));
      opacity: 1;
    }
    .gh-dl-btn:active, .gh-up-btn:active {
      background: var(--bgColor-neutral-muted, rgba(177,186,196,.24));
      transform: scale(.9);
      opacity: 1;
    }
  `;

  (function injectStyle() {
    if (document.getElementById('gh-btn-switcher-style')) return;
    const st = document.createElement('style');
    st.id = 'gh-btn-switcher-style';
    st.textContent = STYLE;
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ================= 1. Обмен кнопок Agents <-> Actions ================= */

  function labelOf(a) {
    const s = a.querySelector('span[data-content], .ActionListItem-label');
    if (s) return norm(s.getAttribute('data-content') || s.textContent);
    return norm(a.textContent);
  }

  function setLabel(a, text) {
    const s = a.querySelector('span[data-content], .ActionListItem-label');
    if (s) {
      if (s.hasAttribute('data-content')) s.setAttribute('data-content', text);
      s.textContent = text;
      return;
    }
    let done = false;
    a.childNodes.forEach(n => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        n.textContent = done ? '' : ' ' + text;
        done = true;
      }
    });
    if (!done) a.appendChild(document.createTextNode(' ' + text));
  }

  function swapIcons(a, b) {
    const ia = a.querySelector('svg'), ib = b.querySelector('svg');
    if (!ia || !ib) return;
    const html = ia.innerHTML, vb = ia.getAttribute('viewBox') || '0 0 16 16';
    ia.innerHTML = ib.innerHTML;
    ia.setAttribute('viewBox', ib.getAttribute('viewBox') || '0 0 16 16');
    ib.innerHTML = html;
    ib.setAttribute('viewBox', vb);
  }

  function swapPair(a, b) {
    const ha = a.getAttribute('href'), hb = b.getAttribute('href');
    a.setAttribute('href', hb);
    b.setAttribute('href', ha);
    setLabel(a, 'Actions');
    setLabel(b, 'Agents');
    swapIcons(a, b);
    a.dataset.ghSwapped = '1';
    b.dataset.ghSwapped = '1';
  }

  function swapTabs() {
    const nav = document.querySelector('nav[aria-label="Repository"]');
    if (!nav) return;
    const anchors = [...nav.querySelectorAll('a[href]')].filter(a => !a.dataset.ghSwapped);
    const isAgents = a => labelOf(a) === 'agents' || /\/agents(\/|$|\?)/.test(a.getAttribute('href') || '');
    const isActions = a => labelOf(a) === 'actions' || /\/actions(\/|$|\?)/.test(a.getAttribute('href') || '');
    const agents = anchors.filter(isAgents);
    const actions = anchors.filter(a => isActions(a) && !isAgents(a));
    const n = Math.min(agents.length, actions.length);
    for (let i = 0; i < n; i++) swapPair(agents[i], actions[i]);
  }

  /* ================= 2. Стрелка скачивания артефакта ================= */

  const RUN_RE = /^\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)(?:\/)?$/;

  const ARROW_DOWN = '<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">' +
    '<path d="M7.25 1.5a.75.75 0 0 1 1.5 0v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 1.06-1.06l2.72 2.72Z"></path>' +
    '<path d="M2.75 12.25a.75.75 0 0 1 .75.75v.75c0 .14.11.25.25.25h8.5a.25.25 0 0 0 .25-.25V13a.75.75 0 0 1 1.5 0v.75A1.75 1.75 0 0 1 12.25 15.5h-8.5A1.75 1.75 0 0 1 2 13.75V13a.75.75 0 0 1 .75-.75Z"></path></svg>';

  const ICON_UPLOAD = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 19.5V6.5A1.5 1.5 0 0 1 4.5 5h4.2a1.5 1.5 0 0 1 1.2.6L11 7h8.5A1.5 1.5 0 0 1 21 8.5v11A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5Z"></path>' +
    '<path d="M12 18.2v-6.4"></path>' +
    '<path d="M9.2 14.6 12 11.8l2.8 2.8"></path></svg>';

  const TTL_OK = 10 * 60 * 1000;
  const TTL_NO = 25 * 1000;
  const CK = 'ghdl:';

  function cacheGet(id) {
    try {
      const raw = sessionStorage.getItem(CK + id);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (Date.now() - o.ts > (o.url ? TTL_OK : TTL_NO)) return null;
      return o;
    } catch (e) { return null; }
  }

  function cacheSet(id, url, st) {
    try { sessionStorage.setItem(CK + id, JSON.stringify({ ts: Date.now(), url, st })); } catch (e) {}
  }

  // очередь: не больше двух запросов одновременно
  let active = 0;
  const queue = [];
  function enqueue(fn) { queue.push(fn); pump(); }
  function pump() {
    while (active < 2 && queue.length) {
      const f = queue.shift();
      active++;
      Promise.resolve().then(f).catch(() => {}).then(() => { active--; pump(); });
    }
  }

  function makeDownloadBtn(url) {
    const b = document.createElement('a');
    b.href = url;
    b.className = 'gh-dl-btn';
    b.setAttribute('download', '');
    b.title = 'Скачать артефакт сборки';
    b.setAttribute('aria-label', 'Скачать артефакт сборки');
    b.innerHTML = ARROW_DOWN;
    Object.assign(b.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: 'inherit', cursor: 'pointer', padding: '0 6px', marginLeft: '2px',
      height: '24px', lineHeight: '0', flex: '0 0 auto', borderRadius: '6px',
      opacity: '0.85', WebkitTapHighlightColor: 'transparent'
    });
    b.addEventListener('click', ev => ev.stopPropagation());
    return b;
  }

  function pickFromDoc(doc, owner, repo, runId) {
    const rows = [...doc.querySelectorAll('tr[data-artifact-id], [data-artifact-id]')];
    if (rows.length) {
      const pick = rows.find(el => /apk/i.test(el.textContent || '')) || rows[0];
      const a = pick.querySelector('a[href*="/artifacts/"]');
      if (a) return new URL(a.getAttribute('href'), location.origin).href;
      const id = pick.getAttribute('data-artifact-id');
      if (id) return `${location.origin}/${owner}/${repo}/actions/runs/${runId}/artifacts/${id}`;
    }
    const link = doc.querySelector(`a[href*="/actions/runs/"][href*="/artifacts/"]`);
    if (link) return new URL(link.getAttribute('href'), location.origin).href;
    return null;
  }

  async function fromPage(url, owner, repo, runId, trace, tag) {
    try {
      const r = await fetch(url, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'text/html' }
      });
      if (!r.ok) { trace.push(tag + ':' + r.status); return null; }
      const html = await r.text();
      const found = pickFromDoc(new DOMParser().parseFromString(html, 'text/html'), owner, repo, runId);
      trace.push(tag + ':' + (found ? 'есть' : 'пусто ' + html.length + 'б'));
      return found;
    } catch (e) { trace.push(tag + ':сбой'); return null; }
  }

  async function fromApi(owner, repo, runId, trace) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`,
        { headers: { 'Accept': 'application/vnd.github+json' } }
      );
      if (!r.ok) { trace.push('api:' + r.status); return null; }
      const j = await r.json();
      const list = (j.artifacts || []).filter(a => !a.expired);
      if (!list.length) { trace.push('api:пусто'); return null; }
      trace.push('api:есть');
      const a = list.find(x => /apk/i.test(x.name)) || list[0];
      return `${location.origin}/${owner}/${repo}/actions/runs/${runId}/artifacts/${a.id}`;
    } catch (e) { trace.push('api:сбой'); return null; }
  }

  // Ищем артефакт тремя путями подряд: блок артефактов, страница сборки, открытый API.
  const lastTrace = new Map();   // runId -> что ответил каждый способ

  async function fetchArtifactUrl(owner, repo, runId) {
    const base = `/${owner}/${repo}/actions/runs/${runId}`;
    const trace = [];
    const url = (await fromPage(`${base}/artifacts_partial`, owner, repo, runId, trace, 'блок'))
             || (await fromPage(base, owner, repo, runId, trace, 'страница'))
             || (await fromApi(owner, repo, runId, trace));
    lastTrace.set(runId, trace.join(' | '));
    return url;
  }

  function rowOf(link) {
    return link.closest('.Box-row, li, tr, [class*="Box-row"]') || link.parentElement;
  }

  function prepareRow(link) {
    if (link.parentElement && link.parentElement.dataset.ghWrap === '1') return link.parentElement;
    if (link.dataset.ghPrepared === '1' && link.parentElement) return link.parentElement;
    const title = link.querySelector('span.markdown-title, span.h4, span[class*="markdown-title"]');
    if (title) {
      title.classList.remove('css-truncate', 'css-truncate-target', 'width-full');
      Object.assign(title.style, {
        minWidth: '0', width: 'auto', flex: '0 1 auto',
        overflow: 'visible', textOverflow: 'clip'
      });
    }
    link.style.flexWrap = 'nowrap';
    link.classList.remove('width-full', 'mb-1');
    link.style.width = 'auto';
    link.style.flex = '0 1 auto';
    link.style.marginBottom = '0';

    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex', alignItems: 'center', width: '100%',
      marginBottom: '4px', minWidth: '0'
    });
    wrap.dataset.ghWrap = '1';
    link.insertAdjacentElement('beforebegin', wrap);
    wrap.appendChild(link);
    link.dataset.ghPrepared = '1';
    return wrap;
  }

  function attachBtn(link, url) {
    if (!document.contains(link)) return;
    const row = rowOf(link);
    if (row.querySelector('.gh-dl-btn')) return;
    prepareRow(link).appendChild(makeDownloadBtn(url));
  }

  const RECHECK = 15000;                  // тихая перепроверка сборок без артефакта

  function statusOf(link) {
    return (link.getAttribute('aria-label') || '').toLowerCase().split(':')[0].trim();
  }

  function isDone(st) {
    return /completed|success|failure|failed|cancel|skipped|timed out|neutral|stale/.test(st);
  }

  function attachWhy(link, runId) {
    const row = rowOf(link);
    if (row.querySelector('.gh-dl-btn') || row.querySelector('.gh-dl-why')) return;
    const el = document.createElement('span');
    el.className = 'gh-dl-why';
    el.textContent = '?';
    el.title = 'Почему нет стрелки';
    Object.assign(el.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: '24px', width: '20px', marginLeft: '2px', fontSize: '13px',
      opacity: '0.35', cursor: 'pointer', flex: '0 0 auto'
    });
    el.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      alert('Артефакт не найден.\n' + (lastTrace.get(runId) || 'нет данных'));
    });
    prepareRow(link).appendChild(el);
  }

  async function checkRow(link) {
    const m = RUN_RE.exec(link.getAttribute('href') || '');
    if (!m) return;
    const [, owner, repo, runId] = m;
    const st = statusOf(link);

    const url = await fetchArtifactUrl(owner, repo, runId);
    cacheSet(runId, url, st);
    if (url) {
      const row = rowOf(link);
      row.querySelectorAll('.gh-dl-why').forEach(el => el.remove());
      attachBtn(link, url);
    } else if (/success/.test(st)) {
      attachWhy(link, runId);
    }
  }

  // проверяем только те строки, которые попали на экран
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      enqueue(() => checkRow(e.target));
    });
  }, { rootMargin: '300px' });

  function scanRuns() {
    document.querySelectorAll('a[href*="/actions/runs/"]').forEach(link => {
      const m = RUN_RE.exec(link.getAttribute('href') || '');
      if (!m || !link.textContent.trim()) return;
      if (link.dataset.ghDl === '1') return;
      link.dataset.ghDl = '1';

      const runId = m[3];
      const st = statusOf(link);
      const cached = cacheGet(runId);

      if (cached && cached.url) { attachBtn(link, cached.url); return; }

      // GitHub сам обновляет строку, когда сборка меняет состояние —
      // это наш сигнал перепроверить артефакт немедленно
      if (cached && cached.st === st) return;
      io.observe(link);
    });
  }

  // тихо перепроверяем строки, где стрелки ещё нет
  setInterval(() => {
    document.querySelectorAll('a[href*="/actions/runs/"]').forEach(link => {
      if (link.dataset.ghDl !== '1') return;
      if (rowOf(link).querySelector('.gh-dl-btn')) return;
      link.dataset.ghDl = '';
    });
    scanRuns();
  }, RECHECK);

  /* ================= 3. Стрелка загрузки файла рядом с Code ================= */

  function repoUploadUrl() {
    const p = location.pathname.split('/').filter(Boolean);
    if (p.length < 2) return null;
    const [owner, repo] = p;
    if (['settings', 'orgs', 'notifications', 'search'].includes(owner)) return null;

    // /o/r/tree/<branch>/<путь...>
    if (p[2] === 'tree' && p[3]) {
      const branch = p[3];
      const path = p.slice(4).join('/');
      return `/${owner}/${repo}/upload/${branch}${path ? '/' + path : ''}`;
    }
    // корень репозитория
    if (p.length === 2) {
      let branch = null;
      const treeLink = document.querySelector(`a[href^="/${owner}/${repo}/tree/"], a[href^="/${owner}/${repo}/blob/"]`);
      if (treeLink) {
        const parts = treeLink.getAttribute('href').split('/');
        branch = parts[4];
      }
      if (!branch) {
        const picker = document.querySelector('[aria-label*="branch" i], summary[title*="branch" i]');
        if (picker) branch = picker.textContent.trim().split('\n')[0].trim();
      }
      if (!branch) return null;
      return `/${owner}/${repo}/upload/${branch}`;
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return el.getClientRects().length > 0;
  }

  function findToolbarKebab() {
    const direct = [
      'button[data-testid="tree-overflow-menu-anchor"]',
      'button[data-testid$="overflow-menu-anchor"]',
      'button[title="More options"]',
      'button[aria-label="More options"]'
    ];
    for (const sel of direct) {
      const el = [...document.querySelectorAll(sel)].find(isVisible);
      if (el) return el;
    }
    // запасной вариант: первое видимое троеточие вне верхней навигации
    const kebab = [...document.querySelectorAll('svg.octicon-kebab-horizontal')]
      .map(svg => svg.closest('button, summary, a'))
      .find(btn => btn && !btn.closest('nav[aria-label="Repository"], .UnderlineNav') && isVisible(btn));
    return kebab || null;
  }

  function findCodeButton() {
    const els = [...document.querySelectorAll('button, a, summary')];
    return els.find(el => {
      if (el.closest('nav[aria-label="Repository"], .UnderlineNav')) return false;
      return norm(el.textContent) === 'code' && el.offsetParent !== null;
    }) || null;
  }

  function makeUploadBtn(url) {
    const a = document.createElement('a');
    a.className = 'gh-up-btn';
    a.href = url;
    a.title = 'Загрузить файлы в эту папку';
    a.setAttribute('aria-label', 'Загрузить файлы в эту папку');
    a.innerHTML = ICON_UPLOAD;
    Object.assign(a.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: 'inherit', cursor: 'pointer', padding: '4px 8px',
      margin: '0 6px', lineHeight: '0', borderRadius: '6px',
      verticalAlign: 'middle', flex: '0 0 auto',
      WebkitTapHighlightColor: 'transparent'
    });
    return a;
  }

  function addUploadButton() {
    const all = [...document.querySelectorAll('.gh-up-btn')];
    const url = repoUploadUrl();

    if (!url) { all.forEach(b => b.remove()); return; }

    // в корне репозитория — сразу после кнопки Code, в папках — слева от троеточия
    const codeBtn = findCodeButton();
    const kebab = codeBtn ? null : findToolbarKebab();
    const target = codeBtn || kebab;
    if (!target) { all.forEach(b => b.remove()); return; }

    // на месте ли кнопка: она должна стоять вплотную к нужной кнопке и быть видимой
    const ok = all.find(b => {
      if (!b.isConnected || !b.offsetWidth) return false;
      return codeBtn ? b.previousElementSibling === codeBtn : b.nextElementSibling === kebab;
    });

    all.forEach(b => { if (b !== ok) b.remove(); });

    if (ok) {
      if (ok.getAttribute('href') !== url) ok.setAttribute('href', url);
      return;
    }

    const a = makeUploadBtn(url);
    if (codeBtn) codeBtn.insertAdjacentElement('afterend', a);
    else kebab.insertAdjacentElement('beforebegin', a);
  }

  /* ================= 4. Компактная зона загрузки файлов ================= */

  // Считаем отправки файлов: сколько в полёте, сколько завершилось, когда была последняя.
  const upWatch = { inflight: 0, done: 0, last: 0, installed: false };

  function installUploadWatch() {
    if (upWatch.installed) return upWatch;
    upWatch.installed = true;

    const isStorage = u => /amazonaws|blob\.core|githubusercontent|uploads?\.github|objects/i.test(String(u || ''));
    const isFileBody = b => !!b && (
      (typeof Blob !== 'undefined' && b instanceof Blob) ||
      (typeof File !== 'undefined' && b instanceof File) ||
      (typeof FormData !== 'undefined' && b instanceof FormData) ||
      (typeof ArrayBuffer !== 'undefined' && b instanceof ArrayBuffer)
    );
    const mark = d => {
      upWatch.inflight += d;
      if (d < 0) upWatch.done++;
      upWatch.last = Date.now();
      if (typeof upWatch.onChange === 'function') upWatch.onChange();
    };

    try {
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (m, u) {
        this.__ghUrl = u;
        return open.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        if (isStorage(this.__ghUrl) || isFileBody(body)) {
          mark(1);
          this.addEventListener('loadend', () => mark(-1));
        }
        return send.apply(this, arguments);
      };
    } catch (e) { /* молча */ }

    try {
      const orig = window.fetch;
      window.fetch = function (input, init) {
        const u = typeof input === 'string' ? input : (input && input.url) || '';
        const body = (init && init.body) || (input && input.body);
        if (isStorage(u) || isFileBody(body)) {
          mark(1);
          return orig.apply(this, arguments).then(
            r => { mark(-1); return r; },
            e => { mark(-1); throw e; }
          );
        }
        return orig.apply(this, arguments);
      };
    } catch (e) { /* молча */ }

    return upWatch;
  }

  function hideFooter() {
    if (!/\/upload(\/|$)/.test(location.pathname)) return;
    document.querySelectorAll('footer, .footer').forEach(el => {
      if (el.dataset.ghNoFooter === '1') return;
      el.dataset.ghNoFooter = '1';
      el.style.display = 'none';
    });
  }

  function slimUpload() {
    if (!/\/upload(\/|$)/.test(location.pathname)) return;
    const input = document.querySelector('input[type="file"]');
    if (!input) return;
    if (document.querySelector('.gh-pick-btn')) return;

    const submit = [...document.querySelectorAll('button, input[type="submit"]')]
      .find(b => /commit changes/i.test(b.textContent || b.value || '') && isVisible(b));
    if (!submit) return;

    // 1. кнопка выбора файлов — справа от «Commit changes»
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn gh-pick-btn';
    btn.textContent = 'Выбрать файлы';
    btn.addEventListener('click', ev => { ev.preventDefault(); input.click(); });
    submit.insertAdjacentElement('afterend', btn);

    // 2. ряд кнопок закреплён внизу экрана
    const bar = submit.parentElement;
    bar.classList.add('gh-bottom-bar');
    Object.assign(bar.style, {
      position: 'fixed', left: '0', right: '0', bottom: '0',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
      padding: '10px 12px', margin: '0', zIndex: '30',
      background: 'var(--bgColor-default, #0d1117)',
      borderTop: '1px solid var(--borderColor-default, #30363d)'
    });

    // 3. зона перетаскивания: прячем картинку и надписи, а список файлов
    //    показываем прямо над закреплённой полосой
    const label = [...document.querySelectorAll('p, h1, h2, h3, div, span')]
      .find(el => !el.children.length && /drag .*files here/i.test(el.textContent || ''));
    let zone = null;
    if (label) {
      zone = label;
      while (zone && zone.parentElement && zone.getBoundingClientRect().height < 200) {
        zone = zone.parentElement;
      }
    }

    // Готовность определяем по самим сетевым отправкам файла, а не по виду страницы:
    // пока идёт хоть одна отправка — не готово; готово, когда отправки прошли и стихли.
    const up = installUploadWatch();
    let picked = false;
    let pickedAt = 0;
    input.addEventListener('change', () => {
      picked = !!(input.files && input.files.length);
      pickedAt = Date.now();
    });

    // Решает только факт отправки файла:
    // ничего не отправлялось — серая; идёт отправка — серая; отправка завершилась — зелёная.
    const isReady = () => {
      if (up.inflight > 0) return false;
      if (up.done > 0) return true;
      return picked && pickedAt > 0 && Date.now() - pickedAt > 30000;   // подстраховка
    };

    // «Commit changes» серая и не нажимается, пока файл не загрузился полностью
    const setReady = ok => {
      submit.disabled = !ok;
      submit.setAttribute('aria-disabled', ok ? 'false' : 'true');
      Object.assign(submit.style, {
        opacity: ok ? '' : '0.45',
        filter: ok ? '' : 'grayscale(1)',
        pointerEvents: ok ? '' : 'none',
        cursor: ok ? '' : 'not-allowed'
      });
    };

    setReady(false);   // до загрузки файла кнопка серая сразу

    const fit = () => {
      let bottom = bar.offsetHeight;
      if (zone && zone.style.display !== 'none') {
        zone.style.bottom = bottom + 'px';
        bottom += zone.offsetHeight;
      }
      document.body.style.paddingBottom = (bottom + 16) + 'px';
    };

    if (zone) {
      // скрываем всё, что уже лежит в зоне (значок, надписи, ссылка выбора)
      [...zone.children].forEach(ch => { ch.dataset.ghHidden = '1'; ch.style.display = 'none'; });
      zone.classList.add('gh-file-zone');
      Object.assign(zone.style, {
        position: 'fixed', left: '0', right: '0', bottom: '0',
        margin: '0', padding: '8px 12px', zIndex: '29', display: 'none',
        maxHeight: '40vh', overflowY: 'auto',
        background: 'var(--bgColor-default, #0d1117)',
        borderTop: '1px solid var(--borderColor-default, #30363d)',
        borderRadius: '0'
      });

      const refresh = () => {
        // всё новое, что GitHub дорисовал в зоне (строки файлов), показываем
        [...zone.children].forEach(ch => {
          if (ch.dataset.ghHidden === '1') return;
          ch.style.display = '';
        });
        const txt = (zone.innerText || '').trim();
        const has = txt.length > 0;
        zone.style.display = has ? '' : 'none';
        zone.style.borderTop = has ? '1px solid var(--borderColor-default, #30363d)' : '0';

        setReady(isReady());
        fit();
      };
      up.onChange = () => { refresh(); setTimeout(refresh, 60); };

      new MutationObserver(refresh).observe(zone, { childList: true, subtree: true, attributes: true });
      input.addEventListener('change', () => setTimeout(refresh, 100));
      setInterval(refresh, 200);
      refresh();
    }

    if (!zone) {
      const tick = () => setReady(isReady());
      up.onChange = () => { tick(); setTimeout(tick, 60); };
      input.addEventListener('change', () => setTimeout(tick, 100));
      setInterval(tick, 200);
      tick();
    }

    fit();
    window.addEventListener('resize', fit);
    new MutationObserver(fit).observe(bar, { childList: true, subtree: true });
  }

  /* ================= запуск ================= */

  function run() {
    swapTabs();
    scanRuns();
    addUploadButton();
    slimUpload();
    hideFooter();
  }

  let t;
  const kick = () => { clearTimeout(t); t = setTimeout(run, 200); };

  new MutationObserver(kick).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('turbo:load', kick);
  document.addEventListener('pjax:end', kick);
  window.addEventListener('popstate', kick);

  // GitHub переключает страницы без перезагрузки — ловим это
  ['pushState', 'replaceState'].forEach(fn => {
    const orig = history[fn];
    history[fn] = function () {
      const r = orig.apply(this, arguments);
      kick();
      return r;
    };
  });

  // подстраховка: кнопка загрузки лёгкая, проверяем её регулярно
  setInterval(addUploadButton, 800);

  kick();
})();
