import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mustExist = [
  'server.js','package.json','.env.example','README.md',
  'public/index.html','public/styles.css','public/app.js',
  'supabase/schema.sql','supabase/migrations/20260818_admin_roles.sql',
  'integration/INTEGRATION_GUIDE.md'
];
let failed = false;
function check(name, ok, detail='') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}
for (const f of mustExist) check(`file ${f}`, fs.existsSync(path.join(root,f)));

const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
const html = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const app = fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const schema = fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
const env = fs.readFileSync(path.join(root,'.env.example'),'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

check('Vercel zero-config: no vercel.json rewrite file', !fs.existsSync(path.join(root,'vercel.json')));
check('Express default export', server.includes('export default app'));
check('Vercel does not rely on express.static', server.includes('if (!process.env.VERCEL)') && server.includes('express.static'));

check('version 1.1.2', pkg.version === '1.1.2');
check('no Google Sheets env', !env.includes('GOOGLE_SHEET'));
check('no Google Sheets runtime', !server.toLowerCase().includes('google sheet') && !server.includes('GOOGLE_SHEET_URL'));
check('event ingestion endpoint', server.includes("app.post('/api/events'"));
check('username + password login', server.includes("app.post('/api/auth/login'") && html.includes('id="username"'));
check('password hashing', server.includes('crypto.scryptSync') && server.includes('hashPassword'));
check('signed admin session', server.includes('createHmac') && server.includes('session_version'));
check('master authorization middleware', server.includes('function requireMaster'));
check('admin list endpoint', server.includes("app.get('/api/admins'"));
check('admin create endpoint', server.includes("app.post('/api/admins'"));
check('admin revoke/restore endpoint', server.includes("/api/admins/:id/status"));
check('admin reset password endpoint', server.includes("/api/admins/:id/password"));
check('self password change endpoint', server.includes("/api/auth/change-password"));
check('manager UI restricted', html.includes('master-only') && app.includes('isMaster()'));
check('admin table schema', schema.includes('create table if not exists public.admins'));
check('admin audit schema', schema.includes('create table if not exists public.admin_audit_logs'));
check('admin RLS', schema.includes('alter table public.admins enable row level security'));
check('AI restricted endpoint', server.includes("app.post('/api/ai'"));
check('off-topic fixed response', server.includes('Tôi chỉ hỗ trợ phân tích dữ liệu hoạt động'));
check('participant name required in ingestion', server.includes('participantName'));
check('character management endpoint', server.includes("app.post('/api/characters'"));
check('analytics SQL function', schema.includes('analytics_snapshot'));
check('dashboard UI', html.includes('BẢNG ĐIỀU KHIỂN GIÁO VIÊN'));
check('AI UI', html.includes('TRỢ LÝ PHÂN TÍCH'));
check('admin management UI', html.includes('Quản lý tài khoản') && html.includes('Tạo tài khoản mới'));

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const appIds = [...app.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]).filter(id => !id.includes('${'));
const missingIds = [...new Set(appIds.filter(id => !htmlIds.has(id)))];
check('all static JS IDs exist in HTML', missingIds.length === 0, missingIds.join(', '));

if (failed) process.exit(1);
console.log('\nAll project validation checks passed.');
