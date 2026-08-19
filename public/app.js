const $ = (id) => document.getElementById(id);
const state = { authenticated: false, user: null, snapshot: null, characters: [], admins: [], currentSection: 'overview' };

const sectionTitles = {
  overview: 'Tổng quan',
  characters: 'Nhân vật',
  participants: 'Người tham gia',
  activity: 'Hoạt động',
  ai: 'AI phân tích',
  admins: 'Quản lý tài khoản',
  guide: 'Hướng dẫn sử dụng',
  account: 'Tài khoản của tôi'
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
  state.user = null;
  $('loginView').classList.remove('hidden');
  $('appView').classList.add('hidden');
}
function showApp(user = state.user) {
  state.authenticated = true;
  if (user) state.user = user;
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  applyRoleUI();
}

function isMaster() { return state.user?.role === 'master'; }
function applyRoleUI() {
  $('currentAdminName').textContent = state.user?.username || '—';
  $('currentAdminRole').textContent = isMaster() ? 'Quản lý chính' : 'Quản lý';
  document.querySelectorAll('.master-only').forEach(el => el.classList.toggle('hidden', !isMaster()));
  if (!isMaster() && state.currentSection === 'admins') state.currentSection = 'overview';
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
  el.innerHTML = `<table class="data-table"><thead><tr><th>Tên</th><th>Slug</th><th>EN</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    ${state.characters.map(c => {
      const deleteBtn = (!c.active && isMaster())
        ? `<button class="toggle-btn danger-btn" data-delete-character="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name_vi)}">Xóa</button>`
        : '';
      return `<tr><td><strong>${escapeHtml(c.name_vi)}</strong></td><td><code>${escapeHtml(c.slug)}</code></td><td>${escapeHtml(c.name_en || '—')}</td><td><span class="badge ${c.active ? '' : 'off'}">${c.active ? 'Đang dùng' : 'Tạm ẩn'}</span></td><td><div class="admin-actions"><button class="toggle-btn" data-toggle-character="${escapeHtml(c.id)}" data-active="${c.active ? '1':'0'}">${c.active ? 'Tạm ẩn':'Kích hoạt'}</button>${deleteBtn}</div></td></tr>`;
    }).join('')}
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
  el.querySelectorAll('[data-delete-character]').forEach(btn => btn.addEventListener('click', async () => {
    const name = btn.dataset.name || 'nhân vật này';
    if (!confirm(`XÓA VĨNH VIỄN ${name}?\n\nToàn bộ phiên học và hoạt động thống kê gắn với nhân vật này cũng sẽ bị xóa. Thao tác không thể hoàn tác.`)) return;
    if (!confirm('Xác nhận lần cuối: bạn chắc chắn muốn xóa vĩnh viễn?')) return;
    btn.disabled = true;
    try {
      await api(`/api/characters/${encodeURIComponent(btn.dataset.deleteCharacter)}`, { method:'DELETE' });
      await loadCharacters();
      await loadSnapshot();
    } catch (error) { alert(error.message); }
    finally { btn.disabled = false; }
  }));
}

async function loadAdmins() {
  if (!isMaster()) return;
  const result = await api('/api/admins');
  state.admins = result.data || [];
  renderAdmins();
}

function renderAdmins() {
  const el = $('adminTableWrap');
  if (!el) return;
  if (!state.admins.length) { el.innerHTML = '<p class="empty">Chưa có tài khoản quản lý.</p>'; return; }
  el.innerHTML = `<table class="data-table"><thead><tr><th>Tên</th><th>Cấp quyền</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Thao tác</th></tr></thead><tbody>
    ${state.admins.map(a => {
      const master = a.role === 'master';
      const actions = master
        ? '<span class="note">Tài khoản gốc</span>'
        : `<div class="admin-actions"><button class="toggle-btn" data-reset-admin="${escapeHtml(a.id)}" data-name="${escapeHtml(a.username)}">Đặt lại mật khẩu</button><button class="toggle-btn ${a.active ? 'danger-btn' : ''}" data-status-admin="${escapeHtml(a.id)}" data-active="${a.active ? '1':'0'}">${a.active ? 'Thu hồi quyền' : 'Khôi phục quyền'}</button>${a.active ? '' : `<button class="toggle-btn danger-btn" data-delete-admin="${escapeHtml(a.id)}" data-name="${escapeHtml(a.username)}">Xóa</button>`}</div>`;
      return `<tr><td><strong>${escapeHtml(a.username)}</strong></td><td><span class="badge ${master ? 'master-badge' : ''}">${master ? 'Quản lý chính' : 'Quản lý'}</span></td><td><span class="badge ${a.active ? '' : 'off'}">${a.active ? 'Đang hoạt động' : 'Đã thu hồi'}</span></td><td>${escapeHtml(fmtDate(a.last_login) || 'Chưa đăng nhập')}</td><td>${actions}</td></tr>`;
    }).join('')}
    </tbody></table>`;

  el.querySelectorAll('[data-status-admin]').forEach(btn => btn.addEventListener('click', async () => {
    const nextActive = btn.dataset.active !== '1';
    const message = nextActive ? 'Khôi phục quyền cho tài khoản này?' : 'Thu hồi quyền? Tài khoản này sẽ không thể tiếp tục truy cập khu vực quản lý.';
    if (!confirm(message)) return;
    btn.disabled = true;
    try {
      await api(`/api/admins/${encodeURIComponent(btn.dataset.statusAdmin)}/status`, { method:'PATCH', body: JSON.stringify({ active: nextActive }) });
      await loadAdmins();
    } catch (error) { alert(error.message); }
    finally { btn.disabled = false; }
  }));

  el.querySelectorAll('[data-reset-admin]').forEach(btn => btn.addEventListener('click', async () => {
    const password = prompt(`Nhập mật khẩu mới cho ${btn.dataset.name} (ít nhất 8 ký tự):`);
    if (password === null) return;
    if (password.length < 8) { alert('Mật khẩu phải có ít nhất 8 ký tự.'); return; }
    const confirmPassword = prompt('Nhập lại mật khẩu mới:');
    if (confirmPassword !== password) { alert('Hai mật khẩu không khớp.'); return; }
    btn.disabled = true;
    try {
      await api(`/api/admins/${encodeURIComponent(btn.dataset.resetAdmin)}/password`, { method:'PATCH', body: JSON.stringify({ newPassword: password }) });
      alert('Đã đặt lại mật khẩu. Các phiên đăng nhập cũ của tài khoản đó đã bị vô hiệu hóa.');
    } catch (error) { alert(error.message); }
    finally { btn.disabled = false; }
  }));

  el.querySelectorAll('[data-delete-admin]').forEach(btn => btn.addEventListener('click', async () => {
    const name = btn.dataset.name || 'tài khoản này';
    if (!confirm(`XÓA VĨNH VIỄN tài khoản ${name}?\n\nTài khoản sẽ không thể khôi phục. Dữ liệu thống kê của người tham gia không bị xóa.`)) return;
    if (!confirm('Xác nhận lần cuối: xóa vĩnh viễn tài khoản quản lý này?')) return;
    btn.disabled = true;
    try {
      await api(`/api/admins/${encodeURIComponent(btn.dataset.deleteAdmin)}`, { method:'DELETE' });
      await loadAdmins();
    } catch (error) { alert(error.message); }
    finally { btn.disabled = false; }
  }));
}

function switchSection(name) {
  if (name === 'admins' && !isMaster()) name = 'overview';
  const section = $(`section-${name}`);
  if (!section) name = 'overview';
  state.currentSection = name;
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  $(`section-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  $('pageTitle').textContent = sectionTitles[name] || 'Quản lý';
  $('filtersPanel').classList.toggle('hidden', name === 'admins' || name === 'account' || name === 'guide');
  if (name === 'admins' && isMaster()) loadAdmins().catch(error => alert(error.message));
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('loginError').textContent = '';
  try {
    const result = await api('/api/auth/login', { method:'POST', body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }) });
    $('password').value = ''; state.user = result.user; showApp(result.user); await initialize();
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

$('adminForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('adminFormMessage');
  const password = $('adminPassword').value;
  const confirmPassword = $('adminPasswordConfirm').value;
  if (password !== confirmPassword) { msg.textContent = 'Hai mật khẩu không khớp.'; return; }
  msg.textContent = 'Đang tạo tài khoản…';
  try {
    await api('/api/admins', { method:'POST', body: JSON.stringify({ username: $('adminUsername').value.trim(), password }) });
    e.target.reset(); msg.textContent = 'Đã tạo tài khoản quản lý.'; await loadAdmins();
  } catch (error) { msg.textContent = error.message; }
});

$('changePasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('changePasswordMessage');
  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  if (newPassword !== $('newPasswordConfirm').value) { msg.textContent = 'Hai mật khẩu mới không khớp.'; return; }
  msg.textContent = 'Đang đổi mật khẩu…';
  try {
    await api('/api/auth/change-password', { method:'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    e.target.reset();
    alert('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
    showLogin();
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
  try { await loadCharacters(); await loadSnapshot(); if (isMaster()) await loadAdmins(); applyRoleUI(); switchSection(state.currentSection); }
  catch (error) { setStatus(error.message, false, true); }
}

(async function boot() {
  try {
    const me = await api('/api/auth/me');
    if (me.ok) { state.user = me.user; showApp(me.user); await initialize(); } else showLogin();
  } catch { showLogin(); }
})();
