'use strict';

const state = {
  publicData: { pages: [], settings: {} },
  user: null,
  csrf: null,
  authMode: 'login',
  adminData: null,
  adminTab: 'pages',
  adminPageSlug: null,
  adminUnsaved: false
};
const app = document.getElementById('app');
const nav = document.getElementById('mainNav');
const mobileNav = document.getElementById('mobileNav');
const authButton = document.getElementById('authButton');
const ownerLink = document.getElementById('ownerLink');
const toastNode = document.getElementById('toast');
let toastTimer;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeHttp = value => { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch { return ''; } };
const formatDate = value => { try { return new Date(value).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'}); } catch { return value || ''; } };
const formatBytes = n => n < 1024 ? `${n} Б` : n < 1024*1024 ? `${(n/1024).toFixed(1)} КБ` : `${(n/1024/1024).toFixed(1)} МБ`;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.method && !['GET','HEAD'].includes(options.method.toUpperCase()) && state.csrf) headers['X-CSRF-Token'] = state.csrf;
  const response = await fetch(path, { credentials:'same-origin', ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    return data;
  }
  if (!response.ok) throw new Error(`Ошибка ${response.status}`);
  return response;
}
function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toastNode.classList.remove('show'),3200);
}
function routeFromPath() {
  const path = decodeURIComponent(location.pathname).replace(/\/+$/,'') || '/';
  if (path === '/' || path === '/index.html') return 'home';
  if (path === '/admin') return 'admin';
  if (path === '/setup') return 'setup';
  return path.replace(/^\//,'').replace(/^p\//,'');
}
function routeUrl(slug) { return slug === 'home' ? '/' : slug === 'admin' ? '/admin' : slug === 'setup' ? '/setup' : `/${encodeURIComponent(slug)}`; }
function setRoute(slug, push = true) {
  const url = routeUrl(slug);
  if (push && location.pathname !== url) history.pushState({route:slug},'',url);
  renderRoute();
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  closeMobileNav();
}
function pageIcon(slug) {
  return ({rules:'✦',purge:'◷',norm:'◈',rest:'☾',games:'✧','game-rules':'⚑',guide:'⌘',tokens:'◇',anonymous:'◌'})[slug] || '✦';
}
function getPageMeta(slug) { return state.publicData.pages.find(p=>p.slug===slug); }
function renderHeader() {
  const pages = state.publicData.pages || [];
  const links = [{slug:'home',title:'Главная'}, ...pages.map(p=>({slug:p.slug,title:p.title}))];
  const current = routeFromPath();
  const items = links.map(item=>`<a href="${routeUrl(item.slug)}" data-route="${escapeHtml(item.slug)}" class="${current===item.slug?'active':''}">${escapeHtml(item.title)}</a>`).join('');
  nav.innerHTML = items;
  mobileNav.innerHTML = items;
  authButton.textContent = state.user ? `Выйти · ${state.user.display_name || state.user.username}` : 'Войти';
  ownerLink.classList.toggle('hidden', !(state.user && state.user.role==='owner'));
  ownerLink.classList.toggle('active', current==='admin');
  const brandName = document.querySelector('.brand-words strong');
  const footerBrand = document.querySelector('.footer-brand strong');
  if (brandName) brandName.textContent = state.publicData.settings.site_name || 'JUSTICE FAITE';
  if (footerBrand) footerBrand.textContent = state.publicData.settings.site_name || 'JUSTICE FAITE';
  const ticker = document.getElementById('ticker');
  if (ticker) {
    const count = state.publicData.settings.member_count && /^\d+$/.test(state.publicData.settings.member_count) ? Number(state.publicData.settings.member_count).toLocaleString('ru-RU') : '—';
    ticker.innerHTML = `<span>УЧАСТНИКОВ: ${escapeHtml(count)}</span><b>✦</b><span>16+</span><b>✦</b><span>ЧИСТКА: ВС · 18:00 МСК</span><b>✦</b><span id="tickerCountdown">ДО ЧИСТКИ: ${escapeHtml(purgeCountdown())}</span><b>✦</b><span>JUSTICE FAITE</span>`;
  }
}
function closeMobileNav(){ mobileNav.classList.add('hidden'); document.getElementById('menuToggle').classList.remove('open'); }
function nextPurge() {
  const now = new Date();
  const mskNow = new Date(now.getTime() + 3*60*60*1000);
  const day = mskNow.getUTCDay();
  let days = (7 - day) % 7;
  const target = new Date(mskNow);
  target.setUTCDate(target.getUTCDate()+days);
  target.setUTCHours(18,0,0,0);
  if (target <= mskNow) target.setUTCDate(target.getUTCDate()+7);
  return new Date(target.getTime()-3*60*60*1000);
}
function purgeCountdown() {
  const ms = nextPurge().getTime()-Date.now();
  if (ms <= 0) return 'Сейчас';
  const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000);
  return d ? `${d} дн. ${h} ч.` : `${h} ч. ${m} мин.`;
}
function renderStats() {
  const s = state.publicData.settings;
  const count = s.member_count && /^\d+$/.test(s.member_count) ? Number(s.member_count).toLocaleString('ru-RU') : '—';
  const sync = s.last_bot_sync ? `Синхронизация: ${formatDate(s.last_bot_sync)}` : (count==='—'?'Ожидает заполнения':'Обновляется владельцем');
  return `<section class="stats-grid" aria-label="Информация о сообществе">
    <article class="stat-card"><div class="stat-label">Участников во флуде</div><div class="stat-value mint">${escapeHtml(count)}</div><div class="stat-detail">${escapeHtml(sync)}</div></article>
    <article class="stat-card"><div class="stat-label">Возрастное ограничение</div><div class="stat-value">16+</div><div class="stat-detail">Правила сообщества</div></article>
    <article class="stat-card"><div class="stat-label">Следующая чистка</div><div class="stat-value" id="purgeCountdown">${escapeHtml(purgeCountdown())}</div><div class="stat-detail">Воскресенье · 18:00 МСК</div></article>
    <article class="stat-card"><div class="stat-label">Разделов портала</div><div class="stat-value">${state.publicData.pages.length}</div><div class="stat-detail">Инструкции и информация</div></article>
  </section>`;
}
function renderHome() {
  const s = state.publicData.settings;
  const pages = state.publicData.pages || [];
  const updates = state.publicData.updates || [];
  const title = s.hero_title || 'Justice Faite.';
  const titleParts = title.split(' ');
  const titleHtml = titleParts.length > 1 ? `${escapeHtml(titleParts.slice(0,-1).join(' '))} <span class="accent">${escapeHtml(titleParts.at(-1))}</span>` : escapeHtml(title);
  const group = safeHttp(s.group_url);
  const featuredSlugs = ['rules','norm','rest'];
  const featured = featuredSlugs.map(slug => pages.find(page => page.slug === slug)).filter(Boolean);
  const remaining = pages.filter(page => !featuredSlugs.includes(page.slug));
  const announcement = String(s.announcement || '').trim();
  const updateList = updates.length ? updates.map(update => `<article class="home-update">
    <time class="home-update-date">${escapeHtml(formatDate(update.created_at))}</time>
    <div class="home-update-copy"><h3>${escapeHtml(update.title)}</h3><p>${escapeHtml(update.body)}</p></div>
  </article>`).join('') : '<div class="home-updates-empty">Официальные изменения появятся здесь после публикации администрацией.</div>';
  return `<div class="home-page">
    <section class="home-hero"><div class="home-hero-main">
      <div class="eyebrow">ОФИЦИАЛЬНЫЙ ПОРТАЛ · 16+</div><h1>${titleHtml}</h1>
      <p>${escapeHtml(s.hero_description || 'Единый справочник сообщества: правила, активность, отдых, игры и полезные инструкции.')}</p>
      <div class="home-hero-actions"><a class="liquid-button primary-button" href="/rules" data-route="rules">Правила сообщества <span>↗</span></a>${group ? `<a class="liquid-button" href="${escapeHtml(group)}" target="_blank" rel="noopener">Перейти во флуд <span>↗</span></a>` : ''}</div>
    </div><aside class="home-hero-mark"><div class="home-mark-letter">JF</div><div class="home-mark-line"></div><div class="home-mark-age">16<span>+</span></div><div class="home-mark-caption">JUSTICE FAITE<br>COMMUNITY PORTAL</div></aside></section>
    <section class="home-start"><div class="home-section-heading"><div><div class="eyebrow">НАЧНИ ЗДЕСЬ</div><h2>Основная информация</h2></div><p>Три раздела, с которых удобнее всего начать</p></div>
      <div class="home-start-grid">${featured.map((page,index) => `<a class="home-start-card" href="/${encodeURIComponent(page.slug)}" data-route="${escapeHtml(page.slug)}"><span class="home-start-index">РАЗДЕЛ 0${index+1}</span><div class="home-card-banner"><span>JUSTICE FAITE · GUIDE</span><strong>${escapeHtml(page.title)}</strong></div><h3 class="home-start-card-title">${escapeHtml(page.title)}</h3><p>${escapeHtml(page.description)}</p><span class="home-start-arrow">Открыть раздел ↗</span></a>`).join('')}</div>
    </section>
    <section class="home-updates"><div class="home-section-heading"><div><div class="eyebrow">ЖУРНАЛ ИЗМЕНЕНИЙ</div><h2>Официальные обновления</h2></div><p>Публикации администрации</p></div><div class="home-updates-list">${updateList}</div></section>
    ${remaining.length ? `<section class="home-library"><div class="home-section-heading"><div><div class="eyebrow">СПРАВОЧНИК</div><h2>Остальные разделы</h2></div><p>Дополнительная информация и инструкции</p></div><div class="home-library-list">${remaining.map(page => `<a class="home-library-link" href="/${encodeURIComponent(page.slug)}" data-route="${escapeHtml(page.slug)}"><span class="home-library-copy"><strong>${escapeHtml(page.title)}</strong><small>${escapeHtml(page.description)}</small></span><span class="home-library-arrow">↗</span></a>`).join('')}</div></section>` : ''}
    <section class="recruitment-banner"><div class="recruitment-banner-top"><span class="recruitment-kicker">ОТКРЫТ НАБОР</span><span class="recruitment-mark">JF / TEAM</span></div><div class="recruitment-content"><h2>В администрацию<br><span>Justice Faite</span></h2><p>Ищем активных и ответственных участников, готовых помогать поддерживать порядок, атмосферу и жизнь сообщества. Опыт не обязателен. Важны адекватность, стабильная активность и желание работать в команде.</p><div class="recruitment-cta recruitment-cta-static">Чтобы откликнуться, напишите в общий чат о желании вступить в администрацию <span>↗</span></div></div><div class="recruitment-decoration" aria-hidden="true">JF</div></section>
    ${announcement ? `<aside class="home-announcement"><span class="eyebrow">ОБЪЯВЛЕНИЕ</span><p>${escapeHtml(announcement)}</p></aside>` : ''}
    <nav class="ios-bottom-dock" aria-label="Быстрая навигация"><a href="/" data-route="home"><span>HOME</span><strong>Главная</strong></a><a href="/rules" data-route="rules"><span>01</span><strong>Правила</strong></a><a href="/norm" data-route="norm"><span>02</span><strong>Активность</strong></a><a href="/rest" data-route="rest"><span>03</span><strong>Рест</strong></a></nav>
    <div class="home-facts"><span><strong>16+</strong> возрастное ограничение</span><span><strong id="purgeCountdown">${escapeHtml(purgeCountdown())}</strong> до воскресной чистки · 18:00 МСК</span>${s.member_count && /^\d+$/.test(s.member_count) ? `<span><strong>${escapeHtml(Number(s.member_count).toLocaleString('ru-RU'))}</strong> участников</span>` : ''}</div>
  </div>`;
}
function botStartLink(kind) {
  const s = state.publicData.settings;
  const username = String(s.bot_username || '').replace(/^@/,'').trim();
  const payload = s[`bot_start_${kind}`] || kind;
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username) || !/^[A-Za-z0-9_-]{1,64}$/.test(payload)) return '';
  return `https://t.me/${username}?start=${encodeURIComponent(payload)}`;
}
function renderGuideCards() {
  const cards = [
    {kind:'rest',icon:'☾',title:'Оформить рест',description:'Бот покажет, как оформить рест в основном чате командой «взять рест на 7 дней» или через владельца и совладельца. Самостоятельно можно взять до 14 дней.'},
    {kind:'tokens',icon:'◇',title:'Жетоны и покупки',description:'Стартовый бонус 30 жетонов, ферма от 5 до 50 каждые 4 часа, баланс, магазин и декоративные покупки.'},
    {kind:'anonymous',icon:'◌',title:'Анонимное обращение',description:'Открой форму прямо в личке с ботом. Важно: администрация видит имя, username и Telegram ID отправителя.'}
  ];
  return `<section class="guide-cards">${cards.map(c=>{
    const href = botStartLink(c.kind);
    return `<article class="guide-card"><span class="card-icon">${c.icon}</span><h3>${c.title}</h3><p>${c.description}</p>${href?`<a class="liquid-button primary-button" href="${escapeHtml(href)}" target="_blank" rel="noopener">Открыть в боте <span>↗</span></a>`:`<span class="liquid-button" aria-disabled="true">Подключим бота позже</span><div class="disabled-hint">В панели владельца нужно указать username бота.</div>`}</article>`;
  }).join('')}</section><div class="admin-notice">Ссылка Telegram передаёт боту параметр запуска через <code>/start</code>. Чтобы сразу открыть нужную функцию, обработчик этого параметра должен быть добавлен в код бота.</div>`;
}
async function renderComments(slug) {
  const host = document.getElementById('commentsMount'); if (!host) return;
  try {
    const data = await api(`/api/pages/${encodeURIComponent(slug)}/comments`);
    const comments = data.comments || [];
    host.innerHTML = `<section class="comments"><div class="comments-head"><h2>Комментарии участников</h2><span>${comments.filter(c=>c.status==='approved').length} опубликовано</span></div>
      ${state.publicData.settings.comments_enabled==='true' ? (state.user ? `<form class="comment-form" id="commentForm"><textarea name="body" maxlength="1200" minlength="3" required placeholder="Поделись мнением или задай вопрос…"></textarea><div class="form-foot"><small>Комментарии появляются после проверки владельцем сайта.</small><button class="liquid-button primary-button" type="submit">Отправить <span>↗</span></button></div></form>` : `<div class="comment-form"><p style="margin:0 0 10px;color:#9cb8aa;font-size:12px">Чтобы оставлять комментарии, войди или создай аккаунт участника.</p><button class="liquid-button" type="button" data-open-auth>Войти / зарегистрироваться</button></div>`) : `<div class="empty-note">Комментарии временно отключены владельцем.</div>`}
      <div class="comment-list">${comments.length?comments.map(c=>`<article class="comment-item"><div class="comment-meta"><strong>${escapeHtml(c.display_name)}</strong><span>${escapeHtml(formatDate(c.created_at))}</span></div><p>${escapeHtml(c.body)}</p>${c.status==='pending'?'<span class="pending-note">На проверке · виден только тебе до публикации</span>':''}</article>`).join(''):'<div class="empty-note">Пока нет опубликованных комментариев. Можно стать первым.</div>'}</div></section>`;
    const form = document.getElementById('commentForm');
    if (form) form.addEventListener('submit', async e=>{
      e.preventDefault(); const body = new FormData(form).get('body');
      const button = form.querySelector('button'); button.disabled = true;
      try { const r=await api('/api/comments',{method:'POST',body:{pageSlug:slug,body}}); toast(r.message); await renderComments(slug); }
      catch(err){toast(err.message);} finally { if (button.isConnected) button.disabled=false; }
    });
  } catch(e) { host.innerHTML = `<div class="empty-note">Комментарии временно недоступны.</div>`; }
}
async function renderPublicPage(slug) {
  const meta = getPageMeta(slug);
  if (!meta) { app.innerHTML = renderNotFound(); return; }
  app.innerHTML = `<section class="content-hero"><div class="eyebrow">${escapeHtml(meta.eyebrow || 'JUSTICE FAITE')}</div><h1>${escapeHtml(meta.title)}</h1><p>${escapeHtml(meta.description || '')}</p></section><div class="content-layout"><div id="guideMount"></div><section class="content-body" id="pageBody"><div class="loading-state"><span class="loading-ring"></span><span>Открываем раздел…</span></div></section><div class="page-actions" id="pageActions"></div><div id="commentsMount"></div></div>`;
  try {
    const data = await api(`/api/pages/${encodeURIComponent(slug)}`);
    const body = document.getElementById('pageBody');
    body.innerHTML = data.page.html || '<p class="copy-bubble">Информация пока не добавлена.</p>';
    body.querySelectorAll('.copy-bubble').forEach((el,i)=>el.style.setProperty('--delay',`${Math.min(i*65,600)}ms`));
    if (slug === 'guide') document.getElementById('guideMount').innerHTML = renderGuideCards();
    const actions = document.getElementById('pageActions');
    const buttons = [];
    buttons.push(`<a class="liquid-button" href="/" data-route="home">← На главную</a>`);
    if (slug === 'rest' && botStartLink('rest')) buttons.push(`<a class="liquid-button primary-button" href="${escapeHtml(botStartLink('rest'))}" target="_blank" rel="noopener">Открыть рест в боте ↗</a>`);
    actions.innerHTML = buttons.join('');
    await renderComments(slug);
    document.title = `${meta.title} · Justice Faite`;
  } catch(e) { document.getElementById('pageBody').innerHTML = `<p class="copy-bubble">Не удалось загрузить раздел: ${escapeHtml(e.message)}</p>`; }
}
function renderNotFound(){return `<section class="setup-shell"><div class="eyebrow">404 / NOT FOUND</div><h1>Этот раздел пока не найден.</h1><p>Возможно, владелец изменил адрес страницы или раздел скрыт.</p><a class="liquid-button primary-button" href="/" data-route="home">На главную ↗</a></section>`;}
function renderAdmin() {
  if (!state.user || state.user.role !== 'owner') {
    app.innerHTML = `<section class="setup-shell"><div class="eyebrow">OWNER ACCESS</div><h1>Панель владельца</h1><p>Этот раздел доступен только владельцу сайта. Сначала войди в свой аккаунт владельца.</p><button class="liquid-button primary-button" type="button" data-open-auth>Войти ↗</button></section>`;
    return;
  }
  app.innerHTML = `<section class="admin-hero"><div class="eyebrow">CONTROL CENTER / OWNER</div><h1>Панель владельца</h1><p>Управляй страницами, комментариями, участниками, статистикой и резервными копиями без редактирования кода.</p></section><div class="admin-layout"><aside class="admin-side" id="adminSide">${[['pages','Страницы'],['updates','Обновления'],['settings','Настройки сайта'],['comments','Комментарии'],['members','Участники'],['backups','Резервные копии']].map(([key,label])=>`<button class="admin-tab ${state.adminTab===key?'active':''}" data-admin-tab="${key}" type="button">${label}</button>`).join('')}</aside><section class="admin-panel" id="adminPanel"><div class="loading-state"><span class="loading-ring"></span><span>Загружаем управление…</span></div></section></div>`;
  loadAdminData().then(()=>renderAdminTab()).catch(e=>{document.getElementById('adminPanel').innerHTML=`<p class="form-error">${escapeHtml(e.message)}</p>`;});
}
async function loadAdminData(){state.adminData=await api('/api/admin/data');if(!state.adminPageSlug && state.adminData.pages.length)state.adminPageSlug=state.adminData.pages[0].slug;}
function adminTabPages(){
  const d=state.adminData; const page=d.pages.find(p=>p.slug===state.adminPageSlug)||d.pages[0]; if(!page)return '<p class="empty-note">Страниц нет.</p>';
  return `<h2>Редактор страниц</h2><p class="panel-sub">Изменения сразу сохраняются в базе сайта. Формат текста: обычные абзацы, ## заголовки, списки через дефис, **жирный текст**.</p>
  <div class="admin-form-grid"><label class="admin-field full">Выбрать страницу<select class="admin-select" id="adminPageSelect">${d.pages.map(p=>`<option value="${escapeHtml(p.slug)}" ${p.slug===page.slug?'selected':''}>${escapeHtml(p.title)} · /${escapeHtml(p.slug)}</option>`).join('')}</select></label>
  <label class="admin-field">Название<input class="admin-input" id="editTitle" value="${escapeHtml(page.title)}" maxlength="80"></label>
  <label class="admin-field">Метка над заголовком<input class="admin-input" id="editEyebrow" value="${escapeHtml(page.eyebrow)}" maxlength="80"></label>
  <label class="admin-field full">Краткое описание<input class="admin-input" id="editDescription" value="${escapeHtml(page.description)}" maxlength="300"></label>
  <label class="admin-field full">Содержимое страницы<textarea class="admin-textarea" id="editContent">${escapeHtml(page.content)}</textarea></label>
  <label class="admin-field">Порядок в меню<input class="admin-input" id="editOrder" type="number" value="${Number(page.nav_order)||100}"></label>
  <label class="admin-switch-row full">Показывать страницу в меню и на главной <input type="checkbox" id="editVisible" ${page.visible?'checked':''}></label>
  <div class="admin-release-editor full"><div><strong>Официальное обновление</strong><p>Отметь галочку, если это изменение нужно показать посетителям на главной странице.</p></div>
    <label class="admin-field">Заголовок обновления<input class="admin-input" id="editReleaseTitle" maxlength="100" value="Обновлён раздел: ${escapeHtml(page.title)}"></label>
    <label class="admin-field">Что изменилось<textarea class="admin-textarea release-note-textarea" id="editReleaseBody" maxlength="600" placeholder="Кратко опиши, что именно изменилось для участников."></textarea></label>
    <label class="admin-switch-row">Добавить это изменение в официальные обновления <input type="checkbox" id="editReleasePublish"></label>
  </div></div>
  <div class="admin-actions"><button class="liquid-button primary-button" id="savePageButton" type="button">Сохранить страницу ↗</button><button class="liquid-button" id="newPageButton" type="button">＋ Новая страница</button>${!['rules','purge','norm','rest','games','game-rules','guide','tokens','anonymous'].includes(page.slug)?`<button class="mini-button danger" id="deletePageButton" type="button">Удалить страницу</button>`:''}</div>`;
}
function adminTabSettings(){
  const s=state.adminData.settings;
  const field=(label,key,val,full=false,placeholder='')=>`<label class="admin-field ${full?'full':''}">${label}<input class="admin-input" data-setting="${key}" value="${escapeHtml(val||'')}" placeholder="${escapeHtml(placeholder)}"></label>`;
  return `<h2>Настройки портала</h2><p class="panel-sub">Здесь настраиваются главная страница, ссылки, счётчик участников и Telegram-бот.</p>
  <div class="admin-form-grid">${field('Название сайта','site_name',s.site_name)}${field('Заголовок главной','hero_title',s.hero_title)}${field('Текст под заголовком','hero_description',s.hero_description,true)}${field('Метка над заголовком','hero_badge',s.hero_badge)}${field('Объявление на главной','announcement',s.announcement,true)}${field('Количество участников','member_count',s.member_count,false,'Например, 128')}${field('Ссылка на флуд','group_url',s.group_url)}${field('Информационный канал','info_url',s.info_url)}${field('Username бота без @','bot_username',s.bot_username,false,'JusticeFaiteBot')}
  <div class="admin-notice full">Deep-link payloads. Значения ниже передаются боту как параметр <code>/start</code>. Позже их обработчик нужно добавить в код бота.</div>${field('Параметр для REST','bot_start_rest',s.bot_start_rest)}${field('Параметр для жетонов','bot_start_tokens',s.bot_start_tokens)}${field('Параметр для анонимных сообщений','bot_start_anonymous',s.bot_start_anonymous)}
  <label class="admin-switch-row full">Разрешить комментарии <input type="checkbox" data-setting-bool="comments_enabled" ${s.comments_enabled==='true'?'checked':''}></label><label class="admin-switch-row full">Разрешить регистрацию участников <input type="checkbox" data-setting-bool="registrations_enabled" ${s.registrations_enabled==='true'?'checked':''}></label></div>
  <div class="admin-actions"><button class="liquid-button primary-button" id="saveSettingsButton" type="button">Сохранить настройки ↗</button></div>
  <hr class="admin-divider"><div class="admin-notice">Если Telegram-бот позже будет подключён к API портала, он сможет автоматически обновлять счётчик участников. Пока его можно менять вручную здесь. Последняя синхронизация: ${s.last_bot_sync?escapeHtml(formatDate(s.last_bot_sync)):'ещё не выполнялась'}.</div>`;
}
function adminTabComments(){
  const rows=state.adminData.comments;
  return `<h2>Комментарии</h2><p class="panel-sub">Новые комментарии сначала попадают на проверку. Публикуй только подходящие сообщения.</p>${rows.length?`<div class="admin-list">${rows.map(c=>`<article class="admin-row"><div class="admin-row-main"><strong>${escapeHtml(c.display_name)} <span class="status-chip ${c.status==='pending'?'pending':''}">${c.status==='pending'?'На проверке':c.status==='approved'?'Опубликован':'Отклонён'}</span></strong><small>/${escapeHtml(c.page_slug)} · ${escapeHtml(formatDate(c.created_at))} · @${escapeHtml(c.username)}</small><p style="margin:8px 0 0;color:#c6dbd0;font-size:11px;white-space:pre-wrap">${escapeHtml(c.body)}</p></div><div class="admin-row-actions">${c.status!=='approved'?`<button class="mini-button good" data-comment-action="approve" data-id="${c.id}">Опубликовать</button>`:''}<button class="mini-button danger" data-comment-action="delete" data-id="${c.id}">Удалить</button></div></article>`).join('')}</div>`:'<div class="empty-note">Пока комментариев нет.</div>'}`;
}
function adminTabMembers(){
  const users=state.adminData.users;
  return `<h2>Участники сайта</h2><p class="panel-sub">Аккаунты портала. Это не список участников Telegram-чата, а пользователи, зарегистрированные на сайте.</p>${users.length?`<div class="admin-list">${users.map(u=>`<article class="admin-row"><div class="admin-row-main"><strong>${escapeHtml(u.display_name)} ${u.role==='owner'?'<span class="status-chip">Владелец</span>':''}</strong><small>@${escapeHtml(u.username)} · ${escapeHtml(formatDate(u.created_at))} · ${u.status==='active'?'Активен':'Заблокирован'}</small></div>${u.role!=='owner'?`<div class="admin-row-actions"><button class="mini-button ${u.status==='active'?'danger':'good'}" data-user-action="${u.status==='active'?'block':'unblock'}" data-id="${u.id}">${u.status==='active'?'Заблокировать':'Разблокировать'}</button></div>`:''}</article>`).join('')}</div>`:'<div class="empty-note">Регистраций пока нет.</div>'}`;
}
function adminTabBackups(){
  const rows=state.adminData.backups||[];
  return `<h2>Резервные копии</h2><p class="panel-sub">База сайта сохраняется автоматически примерно раз в сутки. Владелец также может создать копию вручную и скачать её.</p><div class="admin-notice">Автоматические копии: хранится до 14 последних. Ручные копии: до 20 последних. Для настоящего восстановления нужно остановить приложение и заменить файл базы из резервной копии.</div><div class="admin-actions"><button class="liquid-button primary-button" id="createBackupButton" type="button">＋ Создать копию сейчас</button></div><hr class="admin-divider">${rows.length?`<div class="admin-list">${rows.map(b=>`<article class="admin-row backup-row"><div class="admin-row-main"><strong>${b.kind==='daily'?'Автоматическая':'Ручная'} копия</strong><small>${escapeHtml(b.name)}</small><span class="backup-size">${escapeHtml(formatBytes(b.size))} · ${escapeHtml(formatDate(b.created_at))}</span></div><div class="admin-row-actions"><a class="mini-button good" href="/api/admin/backups/${encodeURIComponent(b.name)}">Скачать</a></div></article>`).join('')}</div>`:'<div class="empty-note">Резервные копии ещё не созданы.</div>'}`;
}
function adminTabUpdates(){
  const rows=state.adminData.updates||[];
  return `<h2>Официальные обновления</h2><p class="panel-sub">Публикации, которые видны на главной. Скрытые записи доступны только владельцу.</p>
  <div class="admin-release-compose">
    <label class="admin-field">Заголовок<input class="admin-input" id="newUpdateTitle" maxlength="100" placeholder="Например, Обновлены правила активности"></label>
    <label class="admin-field">Краткое описание<textarea class="admin-textarea release-note-textarea" id="newUpdateBody" maxlength="600" placeholder="Что изменилось и кого это касается?"></textarea></label>
    <label class="admin-switch-row">Опубликовать на главной <input type="checkbox" id="newUpdatePublished" checked></label>
    <div class="admin-actions"><button class="liquid-button primary-button" id="createUpdateButton" type="button">Добавить обновление ↗</button></div>
  </div>
  <div class="admin-updates-list">${rows.length?rows.map(update=>`<article class="admin-update-row"><div class="admin-update-main"><div class="admin-update-meta"><span>${escapeHtml(formatDate(update.created_at))}</span><span class="status-chip ${update.published?'':'pending'}">${update.published?'Опубликовано':'Скрыто'}</span></div><strong>${escapeHtml(update.title)}</strong><p>${escapeHtml(update.body)}</p></div><div class="admin-row-actions"><button class="mini-button good" data-update-action="${update.published?'hide':'publish'}" data-id="${update.id}">${update.published?'Скрыть':'Опубликовать'}</button><button class="mini-button danger" data-update-action="delete" data-id="${update.id}">Удалить</button></div></article>`).join(''):'<div class="empty-note">Официальных обновлений пока нет.</div>'}</div>`;
}
function renderAdminTab(){
  const panel=document.getElementById('adminPanel'); if(!panel||!state.adminData)return;
  panel.innerHTML = ({pages:adminTabPages,updates:adminTabUpdates,settings:adminTabSettings,comments:adminTabComments,members:adminTabMembers,backups:adminTabBackups}[state.adminTab]||adminTabPages)();
  document.querySelectorAll('[data-admin-tab]').forEach(b=>b.classList.toggle('active',b.dataset.adminTab===state.adminTab));
  wireAdminTab();
}
function markAdminDirty(){state.adminUnsaved=true;}
function wireAdminTab(){
  const select=document.getElementById('adminPageSelect'); if(select)select.addEventListener('change',()=>{state.adminPageSlug=select.value;renderAdminTab();});
  const savePage=document.getElementById('savePageButton'); if(savePage)savePage.addEventListener('click',saveCurrentPage);
  const newPage=document.getElementById('newPageButton'); if(newPage)newPage.addEventListener('click',async()=>{
    const title=prompt('Название новой страницы:'); if(!title)return;
    const slug=prompt('Адрес страницы латиницей, например about:',title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')); if(!slug)return;
    try{const r=await api('/api/admin/pages',{method:'POST',body:{title,slug,eyebrow:'JUSTICE FAITE',description:'Новый раздел сайта.',content:'## Новый раздел\nДобавь содержимое в редакторе владельца.',nav_order:100}});await loadAdminData();await loadPublic();state.adminPageSlug=r.slug;renderHeader();renderAdminTab();toast('Страница создана. Теперь заполни её содержимое.');}catch(e){toast(e.message);}
  });
  const del=document.getElementById('deletePageButton'); if(del)del.addEventListener('click',async()=>{if(!confirm('Удалить эту страницу без возможности отмены?'))return;try{await api(`/api/admin/pages/${state.adminPageSlug}`,{method:'DELETE'});await loadAdminData();await loadPublic();state.adminPageSlug=state.adminData.pages[0]?.slug||null;renderHeader();renderAdminTab();toast('Страница удалена.');}catch(e){toast(e.message);}});
  const saveSettings=document.getElementById('saveSettingsButton'); if(saveSettings)saveSettings.addEventListener('click',saveSettingsForm);
  const createUpdate=document.getElementById('createUpdateButton'); if(createUpdate)createUpdate.addEventListener('click',async()=>{
    const title=document.getElementById('newUpdateTitle').value.trim(), body=document.getElementById('newUpdateBody').value.trim();
    if(!title||!body){toast('Заполни заголовок и описание обновления.');return;}
    createUpdate.disabled=true;
    try{await api('/api/admin/updates',{method:'POST',body:{title,body,published:document.getElementById('newUpdatePublished').checked}});await loadAdminData();await loadPublic();renderAdminTab();toast('Официальное обновление сохранено.');}
    catch(e){toast(e.message);}finally{if(createUpdate.isConnected)createUpdate.disabled=false;}
  });
  document.querySelectorAll('[data-update-action]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.id, action=button.dataset.updateAction;
    try{if(action==='delete'){if(!confirm('Удалить это обновление?'))return;await api(`/api/admin/updates/${id}`,{method:'DELETE'});}else await api(`/api/admin/updates/${id}`,{method:'PATCH',body:{published:action==='publish'}});
      await loadAdminData();await loadPublic();renderAdminTab();toast(action==='delete'?'Обновление удалено.':action==='publish'?'Обновление опубликовано.':'Обновление скрыто.');
    }catch(e){toast(e.message);}
  }));
  const backup=document.getElementById('createBackupButton'); if(backup)backup.addEventListener('click',async()=>{backup.disabled=true;try{await api('/api/admin/backups',{method:'POST',body:{}});await loadAdminData();renderAdminTab();toast('Резервная копия создана.');}catch(e){toast(e.message);}finally{backup.disabled=false;}});
  document.querySelectorAll('[data-comment-action]').forEach(b=>b.addEventListener('click',async()=>{try{if(b.dataset.commentAction==='delete'&&!confirm('Удалить комментарий?'))return; if(b.dataset.commentAction==='approve')await api(`/api/admin/comments/${b.dataset.id}`,{method:'PATCH',body:{status:'approved'}});else await api(`/api/admin/comments/${b.dataset.id}`,{method:'DELETE'});await loadAdminData();renderAdminTab();toast('Список комментариев обновлён.');}catch(e){toast(e.message);}}));
  document.querySelectorAll('[data-user-action]').forEach(b=>b.addEventListener('click',async()=>{const action=b.dataset.userAction;if(action==='block'&&!confirm('Заблокировать пользователя? Его сессии будут завершены.'))return;try{await api(`/api/admin/users/${b.dataset.id}`,{method:'PATCH',body:{status:action==='block'?'blocked':'active'}});await loadAdminData();renderAdminTab();toast('Статус участника изменён.');}catch(e){toast(e.message);}}));
}
async function saveCurrentPage(){
  const button=document.getElementById('savePageButton');if(button)button.disabled=true;
  const publishUpdate=document.getElementById('editReleasePublish')?.checked===true;
  const releaseTitle=document.getElementById('editReleaseTitle')?.value.trim();
  const releaseBody=document.getElementById('editReleaseBody')?.value.trim();
  const pageTitle=document.getElementById('editTitle').value.trim();
  const body={title:pageTitle,eyebrow:document.getElementById('editEyebrow').value,description:document.getElementById('editDescription').value,content:document.getElementById('editContent').value,nav_order:Number(document.getElementById('editOrder').value),visible:document.getElementById('editVisible').checked,releaseNote:publishUpdate?{publish:true,title:releaseTitle||`Обновлён раздел: ${pageTitle}`,body:releaseBody||`Обновлены материалы раздела «${pageTitle}».`}:null};
  try{const result=await api(`/api/admin/pages/${state.adminPageSlug}`,{method:'PUT',body});await loadAdminData();await loadPublic();state.adminUnsaved=false;renderHeader();renderAdminTab();toast(result.updateId?'Страница сохранена, обновление опубликовано.':'Страница сохранена.');}
  catch(e){toast(e.message);}finally{if(button&&button.isConnected)button.disabled=false;}
}
async function saveSettingsForm(){
  const button=document.getElementById('saveSettingsButton');button.disabled=true;
  const body={};document.querySelectorAll('[data-setting]').forEach(el=>body[el.dataset.setting]=el.value);document.querySelectorAll('[data-setting-bool]').forEach(el=>body[el.dataset.settingBool]=String(el.checked));
  try{await api('/api/admin/settings',{method:'PUT',body});await loadPublic();await loadAdminData();renderHeader();renderAdminTab();toast('Настройки сохранены.');}
  catch(e){toast(e.message);}finally{if(button.isConnected)button.disabled=false;}
}
async function renderSetup(){
  const status=await api('/api/setup/status');
  if(!status.needed){app.innerHTML=`<section class="setup-shell"><div class="eyebrow">SETUP COMPLETE</div><h1>Владелец уже зарегистрирован.</h1><p>Войди в существующий аккаунт владельца через кнопку в шапке сайта.</p><button class="liquid-button primary-button" data-open-auth type="button">Войти ↗</button></section>`;return;}
  app.innerHTML=`<section class="setup-shell"><div class="eyebrow">FIRST LAUNCH / OWNER</div><h1>Создание аккаунта владельца</h1><p>Это одноразовая настройка. Ключ появляется в логах сервера при первом запуске. После создания владельца эта форма больше не позволит зарегистрировать второго владельца.</p><form id="setupForm" class="form-stack"><label>Ключ настройки<input name="setupKey" required autocomplete="off" placeholder="Ключ из логов сервера"></label><label>Логин<input name="username" required minlength="3" maxlength="24" placeholder="Только латиница, цифры, . _ -"></label><label>Отображаемое имя<input name="displayName" required maxlength="40" placeholder="Например, Аль-Хайтам"></label><label>Пароль<input name="password" type="password" required minlength="10" placeholder="Минимум 10 символов"></label><p class="form-error" id="setupError"></p><button class="liquid-button primary-button" type="submit">Создать аккаунт владельца ↗</button></form></section>`;
  document.getElementById('setupForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const error=document.getElementById('setupError');try{const r=await api('/api/setup/owner',{method:'POST',body:Object.fromEntries(f.entries())});state.user=r.user;state.csrf=r.csrf;renderHeader();toast('Аккаунт владельца создан.');setRoute('admin');}catch(err){error.textContent=err.message;}});
}
async function loadPublic(){state.publicData=await api('/api/public');}
async function loadMe(){const m=await api('/api/me');state.user=m.user;state.csrf=m.csrf;}
async function renderRoute(){
  renderHeader(); const route=routeFromPath();
  if(route==='setup'){await renderSetup();return;}
  if(route==='admin'){renderAdmin();return;}
  if(route==='home'){app.innerHTML=renderHome();document.title='Justice Faite — Community Portal';}
  else await renderPublicPage(route);
  const countdown=document.getElementById('purgeCountdown'); if(countdown)countdown.textContent=purgeCountdown();
}
function openAuth(mode='login'){
  state.authMode=mode;document.getElementById('authBackdrop').classList.remove('hidden');document.getElementById('authError').textContent='';
  document.querySelectorAll('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));
  const reg=mode==='register';document.getElementById('authTitle').textContent=reg?'Создать аккаунт':'Войти в портал';
  document.getElementById('displayNameField').classList.toggle('hidden',!reg);
  const pw=document.querySelector('#authForm input[name="password"]');pw.autocomplete=reg?'new-password':'current-password';
  document.getElementById('authSubmit').innerHTML=reg?'Зарегистрироваться <span>↗</span>':'Войти <span>↗</span>';
}
function closeAuth(){document.getElementById('authBackdrop').classList.add('hidden');}
function wireGlobalEvents(){
  document.addEventListener('click',async e=>{
    const route=e.target.closest('[data-route]');if(route){e.preventDefault();setRoute(route.dataset.route);return;}
    const auth=e.target.closest('[data-open-auth]');if(auth){openAuth('login');return;}
    const tab=e.target.closest('[data-admin-tab]');if(tab){state.adminTab=tab.dataset.adminTab;renderAdminTab();return;}
  });
  document.getElementById('menuToggle').addEventListener('click',()=>{mobileNav.classList.toggle('hidden');document.getElementById('menuToggle').classList.toggle('open');});
  authButton.addEventListener('click',async()=>{
    if(!state.user){openAuth('login');return;}
    try{await api('/api/auth/logout',{method:'POST',body:{}});state.user=null;state.csrf=null;renderHeader();toast('Ты вышел из аккаунта.');if(routeFromPath()==='admin')setRoute('home',false);else if(routeFromPath()!=='home')renderRoute();}
    catch(e){toast(e.message);}
  });
  document.getElementById('modalClose').addEventListener('click',closeAuth);
  document.getElementById('authBackdrop').addEventListener('click',e=>{if(e.target.id==='authBackdrop')closeAuth();});
  document.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.authMode)));
  document.getElementById('authForm').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;const body=Object.fromEntries(new FormData(form).entries());const error=document.getElementById('authError');const button=document.getElementById('authSubmit');button.disabled=true;
    try{const r=await api(state.authMode==='register'?'/api/auth/register':'/api/auth/login',{method:'POST',body});state.user=r.user;state.csrf=r.csrf;closeAuth();renderHeader();toast(state.authMode==='register'?'Аккаунт создан.':'Вход выполнен.');if(routeFromPath()==='admin')setRoute('admin',false);else if(routeFromPath()!=='home')renderRoute();else if(document.getElementById('commentsMount'))renderComments(routeFromPath());}
    catch(err){error.textContent=err.message;}finally{button.disabled=false;}
  });
  window.addEventListener('popstate',()=>renderRoute());
}
async function boot(){
  document.getElementById('year').textContent=new Date().getFullYear();
  wireGlobalEvents();
  try{await Promise.all([loadPublic(),loadMe()]);const setupState=await api('/api/setup/status');if(setupState.needed&&routeFromPath()!=='setup')history.replaceState({route:'setup'},'', '/setup');renderHeader();await renderRoute();setInterval(()=>{const el=document.getElementById('purgeCountdown');if(el)el.textContent=purgeCountdown();const top=document.getElementById('tickerCountdown');if(top)top.textContent=`ДО ЧИСТКИ: ${purgeCountdown()}`;},60000);}
  catch(e){app.innerHTML=`<section class="setup-shell"><div class="eyebrow">CONNECTION ERROR</div><h1>Не удалось открыть портал.</h1><p>${escapeHtml(e.message)} Проверь, запущен ли сервер.</p></section>`;}
}
boot();
