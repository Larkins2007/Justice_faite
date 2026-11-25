'use strict';

const state = {
  config: null,
  content: null,
  updates: null,
  schedule: null,
  searchIndex: [],
  searchFilter: 'all',
  route: 'home',
  slug: null
};

const app = document.getElementById('app');
const mainNav = document.getElementById('mainNav');
const mobileNav = document.getElementById('mobileNav');
const searchPanel = document.getElementById('searchPanel');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchClear = document.getElementById('searchClear');
const searchFilters = document.getElementById('searchFilters');
const toastNode = document.getElementById('toast');
let toastTimer;

const BANNER_MAP = {
  rules: '/banner_rules.jpg',
  purge: '/banner_purge.jpg',
  norm: '/banner_norm.jpg',
  rest: '/banner_rest.jpg',
  games: '/banner_games.jpg',
  'game-rules': '/banner_game_rules.jpg',
  guide: '/banner_guide.jpg',
  tokens: '/banner_tokens.jpg',
  anonymous: '/banner_anonymous.jpg'
};

const NAV_ITEMS = [
  { id: 'home', label: 'Главная', path: '/' },
  { id: 'sections', label: 'Разделы', path: '/#sections' },
  { id: 'updates', label: 'Обновления', path: '/updates' },
  { id: 'schedule', label: 'Расписание', path: '/schedule' }
];

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  toastNode.textContent = msg;
  toastNode.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2800);
}

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Не удалось загрузить ${path}`);
  return r.json();
}

function parseMarkdown(md) {
  if (!md) return '';
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let para = [], list = [], numbered = [];

  const renderInline = (t) => escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const flushPara = () => {
    if (para.length) {
      out.push(`<div class="content-block"><p>${renderInline(para.join(' '))}</p></div>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      out.push(`<div class="content-block"><ul>${list.map(i => `<li>${renderInline(i)}</li>`).join('')}</ul></div>`);
      list = [];
    }
  };
  const flushNumbered = () => {
    if (numbered.length) {
      out.push(`<div class="content-block"><ol>${numbered.map(i => {
        const m = i.match(/^(\d+(?:\.\d+)*)\.\s+(.*)/);
        return m ? `<li value="${m[1].split('.').pop()}"><strong>${escapeHtml(m[1])}.</strong> ${renderInline(m[2])}</li>` : `<li>${renderInline(i)}</li>`;
      }).join('')}</ol></div>`);
      numbered = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); flushNumbered(); continue; }
    if (/^#{1,3}\s/.test(line)) {
      flushPara(); flushList(); flushNumbered();
      const level = line.match(/^#+/)[0].length;
      const title = line.replace(/^#{1,3}\s+/, '');
      out.push(`<h${Math.min(level + 1, 4)}>${renderInline(title)}</h${Math.min(level + 1, 4)}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) { flushPara(); flushNumbered(); list.push(line.replace(/^[-*]\s+/, '')); continue; }
    if (/^\d+(?:\.\d+)*\.\s+/.test(line)) { flushPara(); flushList(); numbered.push(line); continue; }
    if (/^>\s?/.test(line)) {
      flushPara(); flushList(); flushNumbered();
      out.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    flushList(); flushNumbered();
    para.push(line.trim());
  }
  flushPara(); flushList(); flushNumbered();
  return out.join('\n');
}

function buildSearchIndex() {
  const idx = [];
  if (state.content?.pages) {
    for (const p of state.content.pages) {
      idx.push({
        type: 'page', category: 'Разделы', slug: p.slug, title: p.title,
        description: p.description, text: `${p.title} ${p.description} ${p.content}`,
        path: `/${p.slug}`
      });
    }
  }
  if (state.updates?.releases) {
    for (const r of state.updates.releases) {
      const body = (r.changes || []).flatMap(c => c.items || []).join(' ');
      idx.push({
        type: 'update', category: 'Обновления', slug: r.version, title: `${r.version} — ${r.title}`,
        description: r.summary, text: `${r.title} ${r.summary} ${body}`,
        path: '/updates'
      });
    }
  }
  if (state.schedule?.weeks) {
    for (const w of state.schedule.weeks) {
      for (const d of (w.days || [])) {
        for (const e of (d.events || [])) {
          idx.push({
            type: 'event', category: 'Расписание', slug: e.id || e.title, title: e.title,
            description: `${e.time || ''} ${e.host || ''}`.trim(),
            text: `${e.title} ${e.host || ''} ${e.description || ''}`,
            path: '/schedule'
          });
        }
      }
    }
  }
  state.searchIndex = idx;
}

function routeFromPath() {
  const path = decodeURIComponent(location.pathname).replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/index.html') return { route: 'home', slug: null };
  if (path === '/updates') return { route: 'updates', slug: null };
  if (path === '/schedule') return { route: 'schedule', slug: null };
  if (path === '/search') return { route: 'search', slug: null };
  const page = state.content?.pages?.find(p => `/${p.slug}` === path);
  if (page) return { route: 'page', slug: page.slug };
  return { route: 'home', slug: null };
}

function navigate(path, replace = false) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  render();
}

function renderNav() {
  const { route, slug } = state;
  const html = NAV_ITEMS.map(item => {
    const active = (item.id === 'home' && route === 'home') ||
      (item.id === 'updates' && route === 'updates') ||
      (item.id === 'schedule' && route === 'schedule');
    return `<a href="${item.path}" data-nav="${item.id}" class="${active ? 'active' : ''}">${item.label}</a>`;
  }).join('');
  mainNav.innerHTML = html;
  mobileNav.innerHTML = html + state.content?.pages?.map(p =>
    `<a href="/${p.slug}" data-nav="${p.slug}" class="${slug === p.slug ? 'active' : ''}">${escapeHtml(p.title)}</a>`
  ).join('') || '';
}

function renderHome() {
  const cfg = state.config || {};
  const pages = (state.content?.pages || []).slice().sort((a, b) => (a.nav_order || 100) - (b.nav_order || 100));
  const releases = (state.updates?.releases || []).slice(0, 3);

  return `
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-badge">${escapeHtml(cfg.hero_badge || 'COMMUNITY PORTAL · 16+')}</div>
        <h1>${escapeHtml(cfg.hero_title || 'Justice Faite')}<span>.</span></h1>
        <p class="hero-slogan">${escapeHtml(cfg.hero_slogan || '')}</p>
        <p class="hero-desc">${escapeHtml(cfg.hero_description || '')}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${escapeHtml(cfg.join_url || cfg.info_channel || '#')}" target="_blank" rel="noopener">Вступить во флуд</a>
          <a class="btn btn-ghost" href="#sections">Изучить портал</a>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="hero-visual-inner"><span>JF</span></div>
      </div>
    </section>

    <section class="section" id="sections">
      <div class="section-head">
        <h2>Разделы портала</h2>
        <div class="gallery-nav">
          <button type="button" id="galPrev" aria-label="Назад">‹</button>
          <button type="button" id="galNext" aria-label="Вперёд">›</button>
        </div>
      </div>
      <div class="gallery-wrap">
        <div class="gallery" id="gallery">
          ${pages.map(p => `
            <a class="gallery-card" href="/${p.slug}">
              <img src="${BANNER_MAP[p.slug] || '/banner_rules.jpg'}" alt="" loading="lazy" width="280" height="187">
              <div class="gc-body">
                <div class="gc-eyebrow">${escapeHtml(p.eyebrow || '')}</div>
                <h3>${escapeHtml(p.title)}</h3>
                <p>${escapeHtml(p.description)}</p>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Центр обновлений</h2>
        <a href="/updates">Все релизы →</a>
      </div>
      <div class="cards-grid">
        ${releases.length ? releases.map(r => `
          <a class="card" href="/updates">
            <div class="card-meta">
              ${(r.categories || []).slice(0, 3).map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('')}
            </div>
            <h3>${escapeHtml(r.version)} — ${escapeHtml(r.title)}</h3>
            <p>${escapeHtml(r.summary)}</p>
            <div class="card-date">${escapeHtml(r.date)}</div>
          </a>
        `).join('') : '<p class="schedule-empty">Пока нет опубликованных релизов.</p>'}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Расписание креаторов</h2>
        <a href="/schedule">Открыть календарь →</a>
      </div>
      ${renderSchedulePreview()}
    </section>

    <section class="section">
      <div class="section-head"><h2>О сообществе</h2></div>
      <div class="info-grid">
        <div class="info-card">
          <h3>Информационный канал</h3>
          <p>Актуальные объявления и новости сообщества.</p>
          <p style="margin-top:0.6rem"><a href="${escapeHtml(cfg.info_channel || '#')}" target="_blank" rel="noopener">Telegram →</a></p>
        </div>
        <div class="info-card">
          <h3>Правила</h3>
          <p>Перед участием ознакомься с актуальной редакцией правил.</p>
          <p style="margin-top:0.6rem"><a href="/rules">Читать правила →</a></p>
        </div>
      </div>
    </section>
  `;
}

function renderSchedulePreview() {
  const weeks = state.schedule?.weeks || [];
  if (!weeks.length) {
    return `<div class="schedule-empty">Исходное расписание игр для креаторов в архиве проекта отсутствовало. Структура готова — заполните <code>schedule.json</code> через GitHub.</div>`;
  }
  // Simple next events
  return `<div class="cards-grid">${weeks[0]?.days?.flatMap(d => (d.events || []).map(e => `
    <div class="card">
      <div class="card-meta"><span class="tag">${escapeHtml(d.name || '')}</span></div>
      <h3>${escapeHtml(e.title)}</h3>
      <p>${escapeHtml(e.time || '')} · ${escapeHtml(e.host || '')}</p>
    </div>
  `)).join('') || ''}</div>`;
}

function renderPage(slug) {
  const page = state.content?.pages?.find(p => p.slug === slug);
  if (!page) return `<p>Страница не найдена.</p>`;
  const related = (state.content.pages || [])
    .filter(p => p.slug !== slug)
    .slice(0, 4);

  return `
    <a class="back-link" href="/">← На главную</a>
    <div class="page-hero">
      <div class="eyebrow">${escapeHtml(page.eyebrow || '')}</div>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="page-desc">${escapeHtml(page.description)}</p>
    </div>
    <div class="page-banner">
      <img src="${BANNER_MAP[slug] || '/banner_rules.jpg'}" alt="" loading="lazy">
    </div>
    <article class="prose">
      ${parseMarkdown(page.content)}
    </article>
    ${page.source_url ? `<p style="margin-top:1.5rem"><a href="${escapeHtml(page.source_url)}" target="_blank" rel="noopener">Оригинальный материал →</a></p>` : ''}
    <div class="related">
      <h3>Другие разделы</h3>
      <div class="related-links">
        ${related.map(p => `<a href="/${p.slug}">${escapeHtml(p.title)}</a>`).join('')}
      </div>
    </div>
  `;
}

function renderUpdates() {
  const releases = state.updates?.releases || [];
  return `
    <a class="back-link" href="/">← На главную</a>
    <div class="page-hero">
      <div class="eyebrow">RELEASE CENTER</div>
      <h1>Центр обновлений</h1>
      <p class="page-desc">История релизов Justice Faite Portal. Новые публикации добавляются через updates.json в репозитории.</p>
    </div>
    ${releases.length ? releases.map(r => `
      <article class="release-card">
        <div class="rel-head">
          <span class="rel-version">${escapeHtml(r.version)}</span>
          <span>${escapeHtml(r.title)}</span>
          <span class="rel-date">${escapeHtml(r.date)} · ${escapeHtml(r.status || 'stable')}</span>
        </div>
        <div class="rel-cats">${(r.categories || []).map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('')}</div>
        <p class="rel-summary">${escapeHtml(r.summary)}</p>
        ${(r.changes || []).map(g => `
          <div class="change-group">
            <h4>${escapeHtml(g.category)}</h4>
            <ul>${(g.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
          </div>
        `).join('')}
      </article>
    `).join('') : '<div class="schedule-empty">Релизы пока не опубликованы.</div>'}
  `;
}

function renderSchedule() {
  const weeks = state.schedule?.weeks || [];
  return `
    <a class="back-link" href="/">← На главную</a>
    <div class="page-hero">
      <div class="eyebrow">CREATOR SCHEDULE</div>
      <h1>Календарь игр</h1>
      <p class="page-desc">Недельное расписание мероприятий для креаторов. Данные хранятся в schedule.json.</p>
    </div>
    ${weeks.length ? `
      <div class="schedule-nav">
        <button class="glass-btn" type="button" disabled aria-label="Предыдущая неделя">‹</button>
        <h3>Текущая неделя</h3>
        <button class="glass-btn" type="button" disabled aria-label="Следующая неделя">›</button>
      </div>
      <div class="week-grid">
        ${(weeks[0].days || []).map(d => `
          <div class="day-card ${d.isToday ? 'today' : ''}">
            <div class="day-name">${escapeHtml(d.name || '')}</div>
            ${(d.events || []).map(e => `
              <div class="event-item">
                <div class="event-time">${escapeHtml(e.time || '')}</div>
                <div class="event-title">${escapeHtml(e.title)}</div>
                <div class="event-host">${escapeHtml(e.host || '')}</div>
              </div>
            `).join('') || '<div class="event-item" style="color:var(--faint)">—</div>'}
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="schedule-empty">
        <p><strong>Расписание отсутствует</strong></p>
        <p style="margin-top:0.5rem">В предоставленном архиве исходного проекта файл расписания игр для креаторов не найден. Структура <code>schedule.json</code> подготовлена. Добавьте события через GitHub — они появятся здесь автоматически после деплоя.</p>
      </div>
    `}
  `;
}

function render() {
  const r = routeFromPath();
  state.route = r.route;
  state.slug = r.slug;
  renderNav();

  let html = '';
  if (r.route === 'home') html = renderHome();
  else if (r.route === 'page') html = renderPage(r.slug);
  else if (r.route === 'updates') html = renderUpdates();
  else if (r.route === 'schedule') html = renderSchedule();
  else html = renderHome();

  app.innerHTML = html;

  // Gallery controls
  const gal = document.getElementById('gallery');
  document.getElementById('galPrev')?.addEventListener('click', () => gal?.scrollBy({ left: -300, behavior: 'smooth' }));
  document.getElementById('galNext')?.addEventListener('click', () => gal?.scrollBy({ left: 300, behavior: 'smooth' }));

  // Footer
  const cfg = state.config || {};
  document.getElementById('footerVersion').textContent = `v${cfg.site_version || '2.0.0'}`;
  document.getElementById('footerYear').textContent = cfg.footer_year || new Date().getFullYear();
  document.getElementById('footerLinks').innerHTML = `
    <a href="${escapeHtml(cfg.info_channel || '#')}" target="_blank" rel="noopener">Telegram</a>
    <a href="/rules">Правила</a>
    <a href="/updates">Обновления</a>
  `;

  window.scrollTo(0, 0);
}

function doSearch(q) {
  const query = (q || '').trim().toLowerCase();
  searchClear.hidden = !query;
  if (!query) {
    searchResults.innerHTML = '';
    return;
  }
  const filter = state.searchFilter;
  const results = state.searchIndex.filter(item => {
    if (filter !== 'all' && item.type !== filter) return false;
    return item.text.toLowerCase().includes(query);
  }).slice(0, 20);

  if (!results.length) {
    searchResults.innerHTML = `<div class="search-empty">Ничего не найдено по запросу «${escapeHtml(query)}»</div>`;
    return;
  }

  const highlight = (text) => {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return safe.replace(re, '<mark>$1</mark>');
  };

  searchResults.innerHTML = results.map(r => {
    const snip = (r.description || r.text || '').slice(0, 120);
    return `<a class="search-item" href="${r.path}" role="option">
      <div class="si-cat">${escapeHtml(r.category)}</div>
      <div class="si-title">${highlight(r.title)}</div>
      <div class="si-snippet">${highlight(snip)}…</div>
    </a>`;
  }).join('');
}

function setupSearch() {
  const filters = [
    { id: 'all', label: 'Всё' },
    { id: 'page', label: 'Разделы' },
    { id: 'update', label: 'Обновления' },
    { id: 'event', label: 'Расписание' }
  ];
  searchFilters.innerHTML = filters.map(f =>
    `<button type="button" data-filter="${f.id}" class="${state.searchFilter === f.id ? 'active' : ''}">${f.label}</button>`
  ).join('');

  searchFilters.addEventListener('click', e => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    state.searchFilter = btn.dataset.filter;
    searchFilters.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.filter === state.searchFilter));
    doSearch(searchInput.value);
  });

  searchInput.addEventListener('input', () => doSearch(searchInput.value));
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    doSearch('');
    searchInput.focus();
  });
}

function setupUI() {
  document.getElementById('searchToggle').addEventListener('click', () => {
    const open = searchPanel.hidden;
    searchPanel.hidden = !open;
    if (open) {
      searchInput.focus();
      doSearch(searchInput.value);
    }
  });

  const menuToggle = document.getElementById('menuToggle');
  menuToggle.addEventListener('click', () => {
    const open = mobileNav.hidden;
    mobileNav.hidden = !open;
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.body.addEventListener('click', e => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('/#')) return;
    e.preventDefault();
    searchPanel.hidden = true;
    mobileNav.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    navigate(href);
  });

  window.addEventListener('popstate', () => render());
}

async function init() {
  try {
    const [config, content, updates, schedule] = await Promise.all([
      loadJSON('/api/config').catch(() => loadJSON('/config.json')),
      loadJSON('/api/content').catch(() => loadJSON('/content.json')),
      loadJSON('/api/updates').catch(() => loadJSON('/updates.json')),
      loadJSON('/api/schedule').catch(() => loadJSON('/schedule.json'))
    ]);
    state.config = config;
    state.content = content;
    state.updates = updates;
    state.schedule = schedule;
    buildSearchIndex();
    setupSearch();
    setupUI();
    render();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="schedule-empty"><p>Не удалось загрузить данные портала.</p><p style="margin-top:0.5rem;color:var(--faint)">${escapeHtml(err.message)}</p></div>`;
  }
}

init();
