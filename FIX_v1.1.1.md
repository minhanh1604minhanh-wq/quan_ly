# v1.1.1 — Vercel routing fix

## Sửa lỗi HTTP 404 khi đăng nhập

- `/api/*` được rewrite vào `server.js` (Express).
- `/health` được rewrite vào `server.js`.
- Không dùng catch-all rewrite nên `/styles.css`, `/app.js` và các static asset trong `public/` vẫn được phục vụ trực tiếp.
- Sửa lỗi khai báo lặp `const result` trong `public/app.js` ở `loadSnapshot()`.

## Sau khi deploy

1. Mở `/health`.
2. Phải nhận JSON `ok: true`.
3. Sau đó thử đăng nhập.
4. Nếu `/health` vẫn 404, kiểm tra Vercel Root Directory đang trỏ đúng thư mục có `server.js`, `package.json`, `vercel.json` và `public/`.
