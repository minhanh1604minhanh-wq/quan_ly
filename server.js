import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'history_admin_session';
const OFF_TOPIC_MESSAGE = 'Tôi chỉ hỗ trợ phân tích dữ liệu hoạt động, mức độ quan tâm và hiệu quả sử dụng của hệ thống nhân vật lịch sử.';

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
}

function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing environment variable: ${name}`);
  return value || '';
}

let supabaseClient;
function db() {
  if (!supabaseClient) {
    supabaseClient = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return supabaseClient;
}

let openaiClient;
function openai() {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: env('OPENAI_API_KEY') });
  return openaiClient;
}

function cleanText(value, max = 2000) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\u0000/g, '').trim();
  return text.slice(0, max);
}


const TEACHER_EVENT_LABELS = {
  session_start: 'Bắt đầu phiên học',
  session_end: 'Kết thúc phiên học',
  page_view: 'Mở trang nhân vật',
  character_open: 'Khám phá nhân vật',
  profile_open: 'Mở hồ sơ',
  timeline_view: 'Xem dòng thời gian',
  qa_open: 'Mở Tra cứu sử liệu',
  ask_question: 'Đặt câu hỏi Tra cứu sử liệu',
  whatif_open: 'Mở Giả định lịch sử',
  whatif_question: 'Hỏi Giả định lịch sử',
  roleplay_open: 'Mở Nhập vai quyết sách',
  roleplay_start: 'Bắt đầu tình huống nhập vai',
  roleplay_new_scenario: 'Bắt đầu tình huống nhập vai mới',
  roleplay_choice: 'Chọn phương án nhập vai',
  roleplay_end: 'Kết thúc nhập vai',
  narration_play: 'Nghe thuyết minh',
  language_change: 'Đổi ngôn ngữ',
  pdf_export: 'Xuất phiếu học tập',
  favorite_add: 'Đánh dấu yêu thích',
  favorite_remove: 'Bỏ đánh dấu yêu thích'
};

function teacherEventLabel(value) {
  const key = cleanText(value, 120);
  return TEACHER_EVENT_LABELS[key] || (/[_-]/.test(key) ? 'Hoạt động khác' : key) || 'Hoạt động khác';
}

function teacherDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours} giờ ${minutes} phút`;
  if (minutes) return `${minutes} phút ${secs} giây`;
  return `${secs} giây`;
}

function teacherDataText(snapshot = {}) {
  const totals = snapshot.totals || {};
  const characters = Array.isArray(snapshot.characters) ? snapshot.characters : [];
  const participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  const features = Array.isArray(snapshot.features) ? snapshot.features : [];
  const recent = Array.isArray(snapshot.recentEvents) ? snapshot.recentEvents : [];
  const lines = [];
  lines.push(`Tổng quan: ${Number(totals.characters || 0)} nhân vật; ${Number(totals.participants || 0)} người tham gia; ${Number(totals.sessions || 0)} phiên học; ${Number(totals.interactions || 0)} lượt tương tác; thời gian sử dụng ${teacherDuration(totals.durationSeconds)}.`);
  if (characters.length) {
    lines.push('Theo nhân vật:');
    characters.slice(0, 20).forEach(c => lines.push(`- ${cleanText(c.name, 250) || 'Chưa rõ tên'}: ${Number(c.participants || 0)} người, ${Number(c.sessions || 0)} phiên, ${Number(c.interactions || 0)} lượt tương tác, thời gian ${teacherDuration(c.duration_seconds)}.`));
  }
  if (participants.length) {
    lines.push('Người tham gia có nhiều hoạt động:');
    participants.slice(0, 20).forEach((p, i) => {
      const name = cleanText(p.name, 250) || `Người tham gia #${String(i + 1).padStart(2, '0')}`;
      const extra = [cleanText(p.class_name, 200), cleanText(p.school_name, 300)].filter(Boolean).join(' · ');
      lines.push(`- ${name}${extra ? ` (${extra})` : ''}: ${Number(p.sessions || 0)} phiên, ${Number(p.interactions || 0)} lượt tương tác, thời gian ${teacherDuration(p.duration_seconds)}.`);
    });
  }
  if (features.length) {
    lines.push('Mức độ sử dụng chức năng:');
    features.slice(0, 20).forEach(f => lines.push(`- ${teacherEventLabel(f.feature)}: ${Number(f.count || 0)} lượt.`));
  }
  if (recent.length) {
    lines.push('Một số hoạt động gần đây:');
    recent.slice(0, 15).forEach((e, i) => {
      const name = cleanText(e.participant, 250) || `Người tham gia #${String(i + 1).padStart(2, '0')}`;
      lines.push(`- ${name} · ${cleanText(e.character, 250) || 'Nhân vật chưa rõ'} · ${teacherEventLabel(e.eventType)}${e.content ? ` · ${cleanText(e.content, 180)}` : ''}.`);
    });
  }
  return lines.join('\n');
}

function cleanTeacherAnswer(value) {
  return cleanText(value, 8000)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, 'mã nội bộ')
    .replace(/\bdataset\b/gi, 'dữ liệu hiện có')
    .replace(/\bmetrics\b/gi, 'số liệu')
    .replace(/\bsessions\b/gi, 'phiên học')
    .replace(/\bparticipants\b/gi, 'người tham gia')
    .replace(/\binteractions\b/gi, 'lượt tương tác')
    .replace(/\brecentEvents\b/gi, 'hoạt động gần đây')
    .replace(/\bparticipant_id\b/gi, 'mã người tham gia')
    .replace(/\bUUID\b/gi, 'mã nội bộ');
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function normalizeUsername(value) {
  return cleanText(value, 120).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltB64, hashB64] = String(stored || '').split('$');
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function ensureBootstrapAdmin() {
  const username = cleanText(process.env.SUPERADMIN_USERNAME || 'Nguyễn Minh Anh', 120);
  const password = process.env.SUPERADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
  if (!username || !password) return;
  if (!validPassword(password)) throw new Error('SUPERADMIN_PASSWORD phải có ít nhất 8 ký tự.');

  const { data: masterRows, error: masterError } = await db()
    .from('admins')
    .select('id')
    .eq('role', 'master')
    .limit(1);
  if (masterError) throw masterError;
  if (Array.isArray(masterRows) && masterRows.length) return;

  const usernameKey = normalizeUsername(username);
  const { error } = await db().from('admins').insert({
    username,
    username_key: usernameKey,
    password_hash: hashPassword(password),
    role: 'master',
    active: true,
    session_version: 1
  });
  if (error) throw error;
}

function signAdminToken(admin) {
  const secret = env('ADMIN_SESSION_SECRET');
  const payload = Buffer.from(JSON.stringify({
    sub: admin.id,
    role: admin.role,
    sv: Number(admin.session_version || 1),
    exp: Date.now() + 12 * 60 * 60 * 1000
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', env('ADMIN_SESSION_SECRET')).update(payload).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || Number(data.exp) <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function currentAdmin(req) {
  const token = verifyAdminToken(parseCookies(req)[SESSION_COOKIE]);
  if (!token) return null;
  const { data, error } = await db()
    .from('admins')
    .select('id,username,role,active,session_version,last_login,created_at')
    .eq('id', token.sub)
    .maybeSingle();
  if (error || !data || !data.active || Number(data.session_version || 1) !== Number(token.sv || 1)) return null;
  return data;
}

async function requireAdmin(req, res, next) {
  try {
    const admin = await currentAdmin(req);
    if (!admin) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    req.admin = admin;
    next();
  } catch (error) {
    console.error('admin auth error', error);
    res.status(500).json({ ok: false, error: 'Không thể xác thực tài khoản quản lý.' });
  }
}

function requireMaster(req, res, next) {
  if (req.admin?.role !== 'master') {
    return res.status(403).json({ ok: false, error: 'Chỉ Quản lý chính được thực hiện thao tác này.' });
  }
  next();
}

async function auditAdmin(actorId, targetId, action, metadata = {}) {
  try {
    await db().from('admin_audit_logs').insert({
      actor_id: actorId || null,
      target_id: targetId || null,
      action,
      metadata: metadata && typeof metadata === 'object' ? metadata : {}
    });
  } catch (error) {
    console.warn('admin audit log error', error?.message || error);
  }
}

function requireIngest(req, res, next) {
  const configured = env('ANALYTICS_INGEST_KEY');
  const supplied = req.get('x-analytics-key') || '';
  if (!safeEqual(configured, supplied)) return res.status(401).json({ ok: false, error: 'INVALID_INGEST_KEY' });
  next();
}

function isoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function filterParams(query = {}) {
  return {
    p_from: isoOrNull(query.from),
    p_to: isoOrNull(query.to),
    p_character_slug: cleanText(query.character, 120) || null,
    p_class_name: cleanText(query.className, 200) || null,
    p_school_name: cleanText(query.schoolName, 300) || null
  };
}

async function analyticsSnapshot(query = {}) {
  const { data, error } = await db().rpc('analytics_snapshot', filterParams(query));
  if (error) throw error;
  return data || { totals: {}, characters: [], participants: [], features: [], daily: [], recentEvents: [] };
}

app.get('/', (_req, res) => {
  res.redirect('/index.html');
});

app.get('/health', async (_req, res) => {
  let databaseReady = false;
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { error } = await db().from('characters').select('id', { count: 'exact', head: true });
      databaseReady = !error;
    }
  } catch {}
  res.json({
    ok: true,
    service: 'history-analytics-manager',
    version: '1.2.1',
    databaseReady,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    roleBasedAdmin: true,
    googleSheets: false
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await ensureBootstrapAdmin();
    const username = cleanText(req.body?.username, 120);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Cần nhập tên quản lý và mật khẩu.' });
    }

    const { data: admin, error } = await db()
      .from('admins')
      .select('id,username,username_key,password_hash,role,active,session_version,last_login,created_at')
      .eq('username_key', normalizeUsername(username))
      .maybeSingle();
    if (error) throw error;
    if (!admin || !admin.active || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ ok: false, error: 'Tên quản lý hoặc mật khẩu không đúng.' });
    }

    const now = new Date().toISOString();
    await db().from('admins').update({ last_login: now, updated_at: now }).eq('id', admin.id);
    const secure = process.env.NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE, signAdminToken(admin), {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/'
    });
    await auditAdmin(admin.id, admin.id, 'login');
    res.json({ ok: true, user: { id: admin.id, username: admin.username, role: admin.role } });
  } catch (error) {
    console.error('login error', error);
    res.status(500).json({ ok: false, error: 'Không thể đăng nhập. Kiểm tra cấu hình database/quản lý chính.' });
  }
});

app.post('/api/auth/logout', requireAdmin, async (req, res) => {
  await auditAdmin(req.admin.id, req.admin.id, 'logout');
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const admin = await currentAdmin(req);
    if (!admin) return res.json({ ok: false });
    res.json({ ok: true, user: { id: admin.id, username: admin.username, role: admin.role } });
  } catch {
    res.json({ ok: false });
  }
});

app.post('/api/auth/change-password', requireAdmin, async (req, res) => {
  try {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!validPassword(newPassword)) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải có từ 8 đến 200 ký tự.' });
    }
    const { data: row, error: readError } = await db().from('admins').select('password_hash,session_version').eq('id', req.admin.id).single();
    if (readError) throw readError;
    if (!verifyPassword(currentPassword, row.password_hash)) {
      return res.status(401).json({ ok: false, error: 'Mật khẩu hiện tại không đúng.' });
    }
    const nextVersion = Number(row.session_version || 1) + 1;
    const { error } = await db().from('admins').update({
      password_hash: hashPassword(newPassword),
      session_version: nextVersion,
      updated_at: new Date().toISOString()
    }).eq('id', req.admin.id);
    if (error) throw error;
    await auditAdmin(req.admin.id, req.admin.id, 'change_own_password');
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true, relogin: true });
  } catch (error) {
    console.error('change password error', error);
    res.status(500).json({ ok: false, error: 'Không thể đổi mật khẩu.' });
  }
});

app.get('/api/admins', requireAdmin, requireMaster, async (_req, res) => {
  try {
    const { data, error } = await db().from('admins')
      .select('id,username,role,active,last_login,created_at,updated_at')
      .order('role', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ ok: true, data: data || [] });
  } catch (error) {
    console.error('list admins error', error);
    res.status(500).json({ ok: false, error: 'Không thể tải danh sách quản lý.' });
  }
});

app.post('/api/admins', requireAdmin, requireMaster, async (req, res) => {
  try {
    const username = cleanText(req.body?.username, 120);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (username.length < 3) return res.status(400).json({ ok: false, error: 'Tên quản lý phải có ít nhất 3 ký tự.' });
    if (!validPassword(password)) return res.status(400).json({ ok: false, error: 'Mật khẩu phải có từ 8 đến 200 ký tự.' });

    const payload = {
      username,
      username_key: normalizeUsername(username),
      password_hash: hashPassword(password),
      role: 'manager',
      active: true,
      session_version: 1
    };
    const { data, error } = await db().from('admins').insert(payload).select('id,username,role,active,created_at').single();
    if (error) throw error;
    await auditAdmin(req.admin.id, data.id, 'create_manager', { username: data.username });
    res.json({ ok: true, data });
  } catch (error) {
    const duplicate = String(error?.message || '').toLowerCase().includes('duplicate') || String(error?.code || '') === '23505';
    res.status(duplicate ? 409 : 500).json({ ok: false, error: duplicate ? 'Tên quản lý đã tồn tại.' : 'Không thể tạo tài khoản quản lý.' });
  }
});

app.patch('/api/admins/:id/status', requireAdmin, requireMaster, async (req, res) => {
  try {
    if (req.params.id === req.admin.id) return res.status(400).json({ ok: false, error: 'Không thể tự thu hồi quyền của Quản lý chính.' });
    const active = Boolean(req.body?.active);
    const { data: target, error: readError } = await db().from('admins').select('id,username,role,session_version').eq('id', req.params.id).single();
    if (readError) throw readError;
    if (target.role === 'master') return res.status(403).json({ ok: false, error: 'Không thể thu hồi quyền Quản lý chính từ chức năng này.' });
    const { data, error } = await db().from('admins').update({
      active,
      session_version: Number(target.session_version || 1) + 1,
      updated_at: new Date().toISOString()
    }).eq('id', target.id).select('id,username,role,active').single();
    if (error) throw error;
    await auditAdmin(req.admin.id, target.id, active ? 'restore_manager' : 'revoke_manager', { username: target.username });
    res.json({ ok: true, data });
  } catch (error) {
    console.error('admin status error', error);
    res.status(500).json({ ok: false, error: 'Không thể cập nhật quyền quản lý.' });
  }
});

app.delete('/api/admins/:id', requireAdmin, requireMaster, async (req, res) => {
  try {
    if (req.params.id === req.admin.id) {
      return res.status(400).json({ ok: false, error: 'Không thể xóa tài khoản Quản lý chính đang đăng nhập.' });
    }
    const { data: target, error: readError } = await db()
      .from('admins')
      .select('id,username,role,active')
      .eq('id', req.params.id)
      .single();
    if (readError) throw readError;
    if (target.role === 'master') {
      return res.status(403).json({ ok: false, error: 'Không thể xóa tài khoản Quản lý chính.' });
    }
    if (target.active) {
      return res.status(409).json({ ok: false, error: 'Hãy Thu hồi quyền tài khoản trước khi xóa vĩnh viễn.' });
    }

    await auditAdmin(req.admin.id, target.id, 'delete_manager', { username: target.username });
    const { error } = await db().from('admins').delete().eq('id', target.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    console.error('delete admin error', error);
    res.status(500).json({ ok: false, error: 'Không thể xóa tài khoản quản lý.' });
  }
});

app.patch('/api/admins/:id/password', requireAdmin, requireMaster, async (req, res) => {
  try {
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!validPassword(newPassword)) return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải có từ 8 đến 200 ký tự.' });
    const { data: target, error: readError } = await db().from('admins').select('id,username,role,session_version').eq('id', req.params.id).single();
    if (readError) throw readError;
    if (target.role === 'master' && target.id !== req.admin.id) return res.status(403).json({ ok: false, error: 'Không thể đặt lại mật khẩu của Quản lý chính khác.' });
    const { error } = await db().from('admins').update({
      password_hash: hashPassword(newPassword),
      session_version: Number(target.session_version || 1) + 1,
      updated_at: new Date().toISOString()
    }).eq('id', target.id);
    if (error) throw error;
    await auditAdmin(req.admin.id, target.id, 'reset_manager_password', { username: target.username });
    if (target.id === req.admin.id) res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true, relogin: target.id === req.admin.id });
  } catch (error) {
    console.error('reset password error', error);
    res.status(500).json({ ok: false, error: 'Không thể đặt lại mật khẩu.' });
  }
});

app.post('/api/events', requireIngest, async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = cleanText(body.sessionId, 200);
    const visitorId = cleanText(body.visitorId, 200);
    const eventType = cleanText(body.eventType, 120);
    const participant = body.participant || {};
    const character = body.character || {};
    const participantName = cleanText(participant.name, 250);
    const characterSlug = cleanText(character.slug, 120).toLowerCase();
    const characterName = cleanText(character.nameVi || character.name, 250);

    if (!sessionId || !visitorId || !eventType || !participantName || !characterSlug || !characterName) {
      return res.status(400).json({
        ok: false,
        error: 'Cần sessionId, visitorId, eventType, participant.name, character.slug và character.nameVi.'
      });
    }

    const now = new Date().toISOString();
    const occurredAt = isoOrNull(body.occurredAt) || now;
    const startedAt = isoOrNull(body.startedAt) || occurredAt;
    const externalEventId = cleanText(body.eventId, 200) || crypto.randomUUID();

    const { data: characterRow, error: characterError } = await db()
      .from('characters')
      .upsert({
        slug: characterSlug,
        name_vi: characterName,
        name_en: cleanText(character.nameEn, 250) || null,
        updated_at: now
      }, { onConflict: 'slug' })
      .select('id,slug,name_vi')
      .single();
    if (characterError) throw characterError;

    const { data: participantRow, error: participantError } = await db()
      .from('participants')
      .upsert({
        visitor_id: visitorId,
        name: participantName,
        class_name: cleanText(participant.className, 200) || null,
        school_name: cleanText(participant.schoolName, 300) || null,
        last_seen: now
      }, { onConflict: 'visitor_id' })
      .select('id,name,class_name,school_name')
      .single();
    if (participantError) throw participantError;

    const { data: existingSession, error: existingSessionError } = await db()
      .from('sessions')
      .select('id,session_id,started_at')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (existingSessionError) throw existingSessionError;

    const sessionPayload = {
      participant_id: participantRow.id,
      character_id: characterRow.id,
      language: cleanText(body.language, 20) || 'vi',
      last_seen: now,
      duration_seconds: Math.max(0, Number(body.durationSeconds) || 0),
      metadata: body.sessionMetadata && typeof body.sessionMetadata === 'object' ? body.sessionMetadata : {}
    };
    if (body.endedAt) sessionPayload.ended_at = isoOrNull(body.endedAt);

    let sessionRow;
    if (existingSession) {
      const { data, error } = await db().from('sessions')
        .update(sessionPayload)
        .eq('id', existingSession.id)
        .select('id,session_id')
        .single();
      if (error) throw error;
      sessionRow = data;
    } else {
      const { data, error } = await db().from('sessions')
        .insert({ ...sessionPayload, session_id: sessionId, started_at: startedAt })
        .select('id,session_id')
        .single();
      if (error) throw error;
      sessionRow = data;
    }

    const { error: eventError } = await db().from('events').upsert({
      external_event_id: externalEventId,
      session_id: sessionRow.id,
      participant_id: participantRow.id,
      character_id: characterRow.id,
      event_type: eventType,
      feature: cleanText(body.feature, 120) || null,
      content: cleanText(body.content, 5000) || null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      occurred_at: occurredAt
    }, { onConflict: 'external_event_id', ignoreDuplicates: true });
    if (eventError) throw eventError;

    res.json({ ok: true, eventId: externalEventId });
  } catch (error) {
    console.error('event ingest error', error);
    res.status(500).json({ ok: false, error: 'Không thể lưu hoạt động.' });
  }
});

app.get('/api/analytics/summary', requireAdmin, async (req, res) => {
  try {
    res.json({ ok: true, data: await analyticsSnapshot(req.query) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Không thể tải thống kê.' });
  }
});

app.get('/api/characters', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await db().from('characters').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Không thể tải danh sách nhân vật.' });
  }
});

app.post('/api/characters', requireAdmin, async (req, res) => {
  try {
    const slug = cleanText(req.body?.slug, 120).toLowerCase();
    const nameVi = cleanText(req.body?.nameVi, 250);
    const nameEn = cleanText(req.body?.nameEn, 250) || null;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !nameVi) {
      return res.status(400).json({ ok: false, error: 'Slug không hợp lệ hoặc thiếu tên tiếng Việt.' });
    }
    const { data, error } = await db().from('characters').insert({ slug, name_vi: nameVi, name_en: nameEn, active: true }).select('*').single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (error) {
    const duplicate = String(error?.message || '').toLowerCase().includes('duplicate');
    res.status(duplicate ? 409 : 500).json({ ok: false, error: duplicate ? 'Slug nhân vật đã tồn tại.' : 'Không thể thêm nhân vật.' });
  }
});

app.patch('/api/characters/:id', requireAdmin, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if ('nameVi' in req.body) patch.name_vi = cleanText(req.body.nameVi, 250);
    if ('nameEn' in req.body) patch.name_en = cleanText(req.body.nameEn, 250) || null;
    if ('active' in req.body) patch.active = Boolean(req.body.active);
    const { data, error } = await db().from('characters').update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, error: 'Không thể cập nhật nhân vật.' });
  }
});

app.delete('/api/characters/:id', requireAdmin, requireMaster, async (req, res) => {
  try {
    const { data: target, error: readError } = await db()
      .from('characters')
      .select('id,slug,name_vi,active')
      .eq('id', req.params.id)
      .single();
    if (readError) throw readError;
    if (target.active) {
      return res.status(409).json({ ok: false, error: 'Hãy Tạm ẩn nhân vật trước khi xóa vĩnh viễn.' });
    }

    const { error } = await db().from('characters').delete().eq('id', target.id);
    if (error) throw error;
    await auditAdmin(req.admin.id, null, 'delete_character', {
      characterId: target.id,
      slug: target.slug,
      name: target.name_vi
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('delete character error', error);
    res.status(500).json({ ok: false, error: 'Không thể xóa nhân vật.' });
  }
});

function questionAllowed(question) {
  const q = question.toLowerCase();
  const domainTerms = [
    'nhân vật', 'người tham gia', 'học sinh', 'lớp', 'trường', 'truy cập', 'phiên', 'hoạt động',
    'tương tác', 'tra cứu', 'giả định', 'nhập vai', 'quan tâm', 'website', 'hệ thống',
    'bảng điều khiển', 'chức năng', 'thời lượng', 'hoạt động'
  ];
  const analyticsTerms = [
    'bao nhiêu', 'tổng', 'nhiều nhất', 'ít nhất', 'thống kê', 'số lượt', 'sử dụng', 'so sánh',
    'xu hướng', 'thời gian', 'hiệu quả', 'xếp hạng', 'tần suất', 'tỷ lệ', 'mức độ', 'quan tâm'
  ];
  const improvementTerms = ['cải tiến', 'đề xuất', 'phương án cải thiện', 'nên sửa', 'nên cải thiện'];
  if (improvementTerms.some(term => q.includes(term))) return true;
  return domainTerms.some(term => q.includes(term)) && analyticsTerms.some(term => q.includes(term));
}

app.post('/api/ai', requireAdmin, async (req, res) => {
  try {
    const question = cleanText(req.body?.question, 2000);
    if (!question || !questionAllowed(question)) {
      return res.json({ ok: true, answer: OFF_TOPIC_MESSAGE, restricted: true });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ ok: false, error: 'Chưa cấu hình OPENAI_API_KEY.' });
    }

    const snapshot = await analyticsSnapshot(req.body?.filters || {});
    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-5-mini';
    const dataText = teacherDataText(snapshot);
    const prompt = `Bạn là trợ lý phân tích dành cho giáo viên trong hệ thống bảo tàng lịch sử tương tác.
CHỈ trả lời về dữ liệu sử dụng hệ thống: số nhân vật, người tham gia, lớp/trường, lượt truy cập, phiên học, lượt tương tác, thời gian sử dụng, Tra cứu sử liệu, Giả định lịch sử, Nhập vai quyết sách, mức độ quan tâm, xu hướng sử dụng và đề xuất cải tiến.
KHÔNG trả lời kiến thức lịch sử, thời tiết, chính trị thời sự, viết văn, lập trình hoặc câu hỏi ngoài phạm vi. Nếu ngoài phạm vi, trả đúng câu: "${OFF_TOPIC_MESSAGE}"
Chỉ dùng số liệu được cung cấp bên dưới. Không bịa số. Nếu chưa đủ dữ liệu thì nói rõ chưa đủ dữ liệu.
Không nhắc hoặc hiển thị mã nội bộ của người tham gia. Không dùng các từ kỹ thuật hoặc tên trường dữ liệu như JSON, UUID, dataset, metrics, sessions, participants, interactions, recentEvents, eventType, feature, participant_id.
Không dùng chỉ số "Yêu thích" vì dashboard hiện không theo dõi chỉ số này.
Hãy dùng từ ngữ tiếng Việt đơn giản: "người tham gia", "phiên học", "lượt tương tác", "thời gian sử dụng", "dữ liệu hiện có".
Cách trả lời: mở đầu bằng kết luận trực tiếp; sau đó 2–5 ý ngắn, dễ hiểu; chỉ thêm ghi chú khi thật sự cần. Không viết tiêu đề "KẾT QUẢ" nếu không cần.
Khi nói nhân vật "được quan tâm", căn cứ vào số người tham gia, số phiên học, lượt tương tác và thời gian sử dụng. Nếu hệ thống mới có dữ liệu của một nhân vật, nói rõ chưa có cơ sở so sánh giữa nhiều nhân vật.
Khi đề xuất cải tiến, nói rõ đó là đề xuất dựa trên hành vi sử dụng, không phải dữ kiện lịch sử.

CÂU HỎI CỦA GIÁO VIÊN: ${question}

DỮ LIỆU ĐÃ TỔNG HỢP:
${dataText}`;

    const response = await openai().responses.create({ model, input: prompt });
    const answer = cleanTeacherAnswer(response.output_text) || 'Chưa đủ dữ liệu để trả lời.';
    res.json({ ok: true, answer, restricted: false });
  } catch (error) {
    console.error('AI error', error);
    res.status(500).json({ ok: false, error: 'AI chưa thể phân tích dữ liệu lúc này.' });
  }
});

if (!process.env.VERCEL) {
  app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.listen(PORT, () => console.log(`History Analytics Manager running at http://localhost:${PORT}`));
}

export default app;
