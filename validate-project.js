import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mustExist = [
  'server.js','package.json','vercel.json','.env.example','README.md',
  'public/index.html','public/styles.css','public/app.js',
  'supabase/schema.sql','integration/INTEGRATION_GUIDE.md'
];
let failed = false;
function check(name, ok, detail='') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}
for (const f of mustExist) check(`file ${f}`, fs.existsSync(path.join(root,f)));

const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
const html = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const schema = fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
const env = fs.readFileSync(path.join(root,'.env.example'),'utf8');

check('no Google Sheets env', !env.includes('GOOGLE_SHEET'));
check('no Google Sheets runtime', !server.toLowerCase().includes('google sheet') && !server.includes('GOOGLE_SHEET_URL'));
check('event ingestion endpoint', server.includes("app.post('/api/events'"));
check('admin auth endpoint', server.includes("app.post('/api/auth/login'"));
check('AI restricted endpoint', server.includes("app.post('/api/ai'"));
check('off-topic fixed response', server.includes('Tôi chỉ hỗ trợ phân tích dữ liệu hoạt động'));
check('participant name required in ingestion', server.includes('participantName'));
check('character management endpoint', server.includes("app.post('/api/characters'"));
check('Supabase RLS enabled', schema.includes('enable row level security'));
check('analytics SQL function', schema.includes('analytics_snapshot'));
check('dashboard UI', html.includes('BẢNG ĐIỀU KHIỂN GIÁO VIÊN'));
check('AI UI', html.includes('TRỢ LÝ PHÂN TÍCH'));

if (failed) process.exit(1);
console.log('\nAll project validation checks passed.');
