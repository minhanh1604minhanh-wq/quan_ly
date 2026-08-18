const $ = (id) => document.getElementById(id);
const state = { authenticated: false, snapshot: null, characters: [], currentSection: 'overview' };

const sectionTitles = {
  overview: 'Tổng quan',
  characters: 'Nhân vật',
  participants: 'Người tham gia',
  activity: 'Hoạt động',
  ai: 'AI phân tích'
};

function fmtNumber(n) { return new Intl.NumberFormat('vi-VN').format(Number(n || 0)); }
function fmtDuration(seconds) {
  const s = Number(seconds || 0);
  if (s < 60) return `${Math.round(s)} giây`;
  if (s < 3600) return `${Math.round(s / 60)} phút`;
  return `${(s / 3600).toFixed(1)} giờ`;
}
function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (response.status === 401 && !url.includes('/api/auth/')) {
    showLogin();
    throw new Error('Phiên đăng nhập đã hết hạn.');
  }
  if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function showLogin() {
  state.authenticated = false;
  $('loginView').classList.remove('hidden');
  $('appView').classList.add('hidden');
}
function showApp() {
  state.authenticated = true;
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
}

function currentFilters() {
  return {
    from: $('filterFrom').value ? `${$('filterFrom').value}T00:00:00+07:00` : '',
    to: $('filterTo').value ? `${$('filterTo').value}T23:59:59+07:00` : '',
    character: $('filterCharacter').value,
    className: $('filterClass').value.trim(),
    schoolName: $('filterSchool').value.trim()
  };
}
function queryString(filters = currentFilters()) {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k,v]) => { if (v) p.set(k, v); });
  return p.toString();
}

async function loadCharacters() {
  const result = await api('/api/characters');
  state.characters = result.data || [];
  renderCharacterFilter();
  renderCharacterAdmin();
}

function renderCharacterFilter() {
  const selected = $('filterCharacter').value;
  $('filterCharacter').innerHTML = '<option value="">Tất cả</option>' + state.characters
    .filter(c => c.active)
    .map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name_vi)}</option>`).join('');
  if ([...$('filterCharacter').options].some(o => o.value === selected)) $('filterCharacter').value = selected;
}

async function loadSnapshot() {
  setStatus('Đang tải dữ liệu…');
  try {
    const result = await api(`/api/analytics/summary?${queryString()}`);
    state.snapshot = result.data;
    renderSnapshot();
    setStatus('Dữ liệu đã cập nhật', true);
  } catch (error) {
    setStatus(error.message || 'Không thể tải dữ liệu', false, true);
  }
}

function setStatus(text, ok = false, error = false) {
  const el = $('statusPill');
  el.textContent = text;
  el.classList.toggle('ok', ok);
  el.classList.toggle('error', error);
}

function renderSnapshot() {
  const s = state.snapshot || {};
  const t = s.totals || {};
  $('statCharacters').textContent = fmtNumber(t.characters);
  $('statParticipants').textContent = fmtNumber(t.participants);
  $('statSessions').textContent = fmtNumber(t.sessions);
  $('statInteractions').textContent = fmtNumber(t.interactions);
  $('statFavorites').textContent = fmtNumber(t.favorites);
  $('statDuration').textContent = fmtDuration(t.durationSeconds);
  renderCharacterRanking(s.characters || []);
  renderFeatures(s.features || []);
  renderDaily(s.daily || []);
  renderParticipants(s.participants || []);
  renderActivity(s.recentEvents || []);
}

function renderCharacterRanking(rows) {
  const el = $('characterRanking');
  if (!rows.length) { el.className = 'ranking-list empty'; el.textContent = 'Chưa có dữ liệu.'; return; }
  el.className = 'ranking-list';
  el.innerHTML = rows.slice(0, 10).map((r, i) => `
    <div class="rank-row">
      <div class="rank-no">${i + 1}</div>
      <div><strong>${escapeHtml(r.name)}</strong><small>${fmtNumber(r.participants)} người · ${fmtNumber(r.sessions)} phiên · ${fmtNumber(r.favorites)} yêu thích</small></div>
      <div class="rank-value">${fmtNumber(r.interactions)}<small style="display:block">tương tác</small></div>
    </div>`).join('');
}

function renderFeatures(rows) {
  const el = $('featureBars');
  if (!rows.length) { el.className = 'bar-list empty'; el.textContent = 'Chưa có dữ liệu.'; return; }
  const max = Math.max(...rows.map(r => Number(r.count || 0)), 1);
  el.className = 'bar-list';
  el.innerHTML = rows.slice(0, 12).map(r => `
    <div class="bar-row">
      <span title="${escapeHtml(r.feature)}">${escapeHtml(r.feature)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, Number(r.count || 0) / max * 100)}%"></div></div>
      <b>${fmtNumber(r.count)}</b>
    </div>`).join('');
}

function renderDaily(rows) {
  const el = $('dailyChart');
  if (!rows.length) { el.className = 'daily-chart empty'; el.textContent = 'Chưa có dữ liệu.'; return; }
  const max = Math.max(...rows.map(r => Number(r.interactions || 0)), 1);
  el.className = 'daily-chart';
  el.innerHTML = rows.slice(-31).map(r => {
    const h = Math.max(2, Math.round(Number(r.interactions || 0) / max * 100));
    return `<div class="day-col" title="${escapeHtml(r.day)} · ${fmtNumber(r.participants)} người · ${fmtNumber(r.sessions)} phiên">
      <b>${fmtNumber(r.interactions)}</b><div class="day-bar-wrap"><div class="day-bar" style="height:${h}%"></div></div><small>${escapeHtml(r.day)}</small>
    </div>`;
  }).join('');
}

function renderParticipants(rows) {
  const el = $('participantTableWrap');
  if (!rows.length) { el.innerHTML = '<p class="empty">Chưa có dữ liệu người tham gia.</p>'; return; }
  el.innerHTML = `<table class="data-table"><thead><tr><th>#</th><th>Tên</th><th>Lớp</th><th>Trường</th><th>Phiên</th><th>Tương tác</th><th>Thời gian</th><th>Lần cuối</th></tr></thead><tbody>
    ${rows.map((r,i) => `<tr><td>${i+1}</td><td><strong>${escapeHtml(r.name)}</strong></td><td>${escapeHtml(r.class_name || '—')}</td><td>${escapeHtml(r.school_name || '—')}</td><td>${fmtNumber(r.sessions)}</td><td>${fmtNumber(r.interactions)}</td><td>${fmtDuration(r.duration_seconds)}</td><td>${escapeHtml(fmtDate(r.last_seen))}</td></tr>`).join('')}
    </tbody></table>`;
}

function renderActivity(rows) {
  const el = $('activityTableWrap');
  if (!rows.length) { el.innerHTML = '<p class="empty">Chưa có hoạt động.</p>'; return; }
  el.innerHTML = `<table class="data-table"><thead><tr><th>Thời gian</th><th>Người tham gia</th><th>Nhân vật</th><th>Loại</th><th>Chức năng</th><th>Nội dung</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${escapeHtml(fmtDate(r.occurredAt))}</td><td><strong>${escapeHtml(r.participant)}</strong><br><small>${escapeHtml([r.className,r.schoolName].filter(Boolean).join(' · ') || '')}</small></td><td>${escapeHtml(r.character)}</td><td><span class="badge">${escapeHtml(r.eventType)}</span></td><td>${escapeHtml(r.feature || '—')}</td><td>${escapeHtml(r.content || '—')}</td></tr>`).join('')}
    </tbody></table>`;
}

function renderCharacterAdmin() {
  const el = $('characterTableWrap');
  if (!state.characters.length) { el.innerHTML = '<p class="empty">Chưa có nhân vật.</p>'; return; }
  el.innerHTML = `<table class="data-table"><thead><tr><th>Tên</th><th>Slug</th><th>EN</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${state.characters.map(c => `<tr><td><strong>${escapeHtml(c.name_vi)}</strong></td><td><code>${escapeHtml(c.slug)}</code></td><td>${escapeHtml(c.name_en || '—')}</td><td><span class="badge ${c.active ? '' : 'off'}">${c.active ? 'Đang dùng' : 'Tạm ẩn'}</span></td><td><button class="toggle-btn" data-toggle-character="${escapeHtml(c.id)}" data-active="${c.active ? '1':'0'}">${c.active ? 'Tạm ẩn':'Kích hoạt'}</button></td></tr>`).join('')}
    </tbody></table>`;
  el.querySelectorAll('[data-toggle-character]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await api(`/api/characters/${encodeURIComponent(btn.dataset.toggleCharacter)}`, { method:'PATCH', body: JSON.stringify({ active: btn.dataset.active !== '1' }) });
      await loadCharacters();
      await loadSnapshot();
    } catch (e) { alert(e.message); }
    finally { btn.disabled = false; }
  }));
}

function switchSection(name) {
  state.currentSection = name;
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  $(`section-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  $('pageTitle').textContent = sectionTitles[name] || 'Quản lý';
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('loginError').textContent = '';
  try {
    await api('/api/auth/login', { method:'POST', body: JSON.stringify({ password: $('password').value }) });
    $('password').value = ''; showApp(); await initialize();
  } catch (error) { $('loginError').textContent = error.message; }
});
$('logoutBtn').addEventListener('click', async () => { try { await api('/api/auth/logout', { method:'POST' }); } catch {} showLogin(); });

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.section)));
$('applyFilters').addEventListener('click', loadSnapshot);
$('clearFilters').addEventListener('click', () => { ['filterFrom','filterTo','filterClass','filterSchool'].forEach(id => $(id).value = ''); $('filterCharacter').value=''; loadSnapshot(); });

$('characterForm').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('characterFormMessage'); msg.textContent = 'Đang thêm…';
  try {
    await api('/api/characters', { method:'POST', body: JSON.stringify({ slug:$('characterSlug').value.trim(), nameVi:$('characterNameVi').value.trim(), nameEn:$('characterNameEn').value.trim() }) });
    e.target.reset(); msg.textContent = 'Đã thêm nhân vật.'; await loadCharacters(); await loadSnapshot();
  } catch (error) { msg.textContent = error.message; }
});

document.querySelectorAll('[data-question]').forEach(btn => btn.addEventListener('click', () => { $('aiQuestion').value = btn.dataset.question; $('aiQuestion').focus(); }));
$('aiForm').addEventListener('submit', async e => {
  e.preventDefault();
  const question = $('aiQuestion').value.trim(); if (!question) return;
  const answer = $('aiAnswer'); answer.className = 'ai-answer loading'; answer.textContent = 'Đang phân tích dữ liệu…';
  try {
    const result = await api('/api/ai', { method:'POST', body: JSON.stringify({ question, filters: currentFilters() }) });
    answer.className = 'ai-answer'; answer.textContent = result.answer;
  } catch (error) { answer.className = 'ai-answer'; answer.textContent = error.message; }
});

async function initialize() {
  try { await loadCharacters(); await loadSnapshot(); switchSection(state.currentSection); }
  catch (error) { setStatus(error.message, false, true); }
}

(async function boot() {
  try {
    const me = await api('/api/auth/me');
    if (me.ok) { showApp(); await initialize(); } else showLogin();
  } catch { showLogin(); }
})();
