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
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

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

function signAdminToken() {
  const secret = env('ADMIN_SESSION_SECRET');
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return false;
    const expected = crypto.createHmac('sha256', env('ADMIN_SESSION_SECRET')).update(payload).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!verifyAdminToken(parseCookies(req)[SESSION_COOKIE])) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  next();
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
    databaseReady,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    googleSheets: false
  });
});

app.post('/api/auth/login', (req, res) => {
  const password = cleanText(req.body?.password, 500);
  if (!safeEqual(password, env('ADMIN_PASSWORD'))) {
    return res.status(401).json({ ok: false, error: 'Mật khẩu không đúng.' });
  }
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE, signAdminToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ ok: verifyAdminToken(parseCookies(req)[SESSION_COOKIE]) });
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
        active: true,
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

function questionAllowed(question) {
  const q = question.toLowerCase();
  const domainTerms = [
    'nhân vật', 'người tham gia', 'học sinh', 'lớp', 'trường', 'truy cập', 'phiên', 'hoạt động',
    'tương tác', 'tra cứu', 'giả định', 'nhập vai', 'yêu thích', 'quan tâm', 'website', 'hệ thống',
    'dashboard', 'feature', 'chức năng', 'session', 'visitor', 'participant', 'engagement'
  ];
  const analyticsTerms = [
    'bao nhiêu', 'tổng', 'nhiều nhất', 'ít nhất', 'thống kê', 'số lượt', 'sử dụng', 'so sánh',
    'xu hướng', 'thời gian', 'hiệu quả', 'xếp hạng', 'tần suất', 'tỷ lệ', 'mức độ', 'quan tâm', 'yêu thích'
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
    const prompt = `Bạn là trợ lý phân tích dữ liệu dành cho giáo viên trong hệ thống bảo tàng lịch sử tương tác.
CHỈ trả lời câu hỏi liên quan dữ liệu hoạt động của hệ thống: số nhân vật, người tham gia, lớp/trường, lượt truy cập, phiên, tương tác, Tra cứu sử liệu, Giả định lịch sử, Nhập vai quyết sách, yêu thích, mức độ quan tâm, xu hướng sử dụng và đề xuất cải tiến dựa trên dữ liệu.
KHÔNG trả lời kiến thức lịch sử, thời tiết, chính trị thời sự, viết văn, lập trình hoặc câu hỏi ngoài phạm vi. Nếu ngoài phạm vi, trả đúng câu: "${OFF_TOPIC_MESSAGE}"
Chỉ dùng dữ liệu JSON được cung cấp. Không bịa số. Nếu chưa đủ dữ liệu thì nói rõ chưa đủ dữ liệu.
"Được yêu thích" chỉ dựa trên favorites/favorite_add. "Được quan tâm" phải giải thích dựa trên participants, sessions và interactions; không tự đồng nhất với yêu thích.
Khi đề xuất cải tiến, nêu đó là đề xuất dựa trên hành vi sử dụng, không phải dữ kiện lịch sử.
Trả lời ngắn gọn, rõ ràng, tiếng Việt.

CÂU HỎI: ${question}

DỮ LIỆU:
${JSON.stringify(snapshot)}`;

    const response = await openai().responses.create({ model, input: prompt });
    const answer = cleanText(response.output_text, 8000) || 'Chưa đủ dữ liệu để trả lời.';
    res.json({ ok: true, answer, restricted: false });
  } catch (error) {
    console.error('AI error', error);
    res.status(500).json({ ok: false, error: 'AI chưa thể phân tích dữ liệu lúc này.' });
  }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`History Analytics Manager running at http://localhost:${PORT}`));
}

export default app;
