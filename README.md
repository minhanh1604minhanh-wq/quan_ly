# HISTORY ANALYTICS MANAGER v1.1.1

> Bản v1.1.2 giữ hệ thống đăng nhập nhiều cấp và chuyển sang cơ chế Express zero-config chính thức của Vercel. Không dùng rewrite `/api/* -> /server.js`; Vercel tự phát hiện `server.js` là Express app, còn file trong `public/` được phục vụ như static assets.

Website quản lý riêng cho giáo viên, thay cho Google Sheets.

## Chức năng

- Lưu hoạt động từ nhiều website nhân vật vào 1 database chung.
- Tên người tham gia bắt buộc; lớp và trường không bắt buộc.
- Dashboard: tổng nhân vật, người tham gia, phiên, hoạt động, xếp hạng nhân vật, chức năng sử dụng, truy cập theo ngày.
- Bộ lọc theo thời gian, nhân vật, lớp, trường.
- Quản lý/thêm nhân vật.
- Xem người tham gia và hoạt động gần đây.
- AI giáo viên chỉ trả lời câu hỏi về dữ liệu sử dụng hệ thống; câu hỏi ngoài phạm vi bị từ chối.
- Không dùng Google Sheets.
- Đăng nhập bằng **tên quản lý + mật khẩu**.
- **Quản lý chính** có thể tạo quản lý mới, đặt lại mật khẩu, thu hồi/khôi phục quyền.
- **Quản lý thường** được dùng dashboard, nhân vật, người tham gia, hoạt động và AI nhưng không được quản lý tài khoản khác.
- Mọi tài khoản có thể tự đổi mật khẩu; đổi/reset/thu hồi quyền sẽ vô hiệu hóa phiên đăng nhập cũ.


## Tài khoản Quản lý chính ban đầu

Không hard-code mật khẩu vào GitHub/ZIP. Trong Vercel → Project Settings → Environment Variables, đặt:

```env
SUPERADMIN_USERNAME="Nguyễn Minh Anh"
SUPERADMIN_PASSWORD=<mật khẩu do chủ hệ thống cung cấp>
ADMIN_SESSION_SECRET=<chuỗi ngẫu nhiên dài>
```

Với yêu cầu hiện tại của chủ hệ thống, đặt `SUPERADMIN_PASSWORD` trên Vercel thành mật khẩu đã cung cấp trong cuộc trao đổi. Sau lần đăng nhập đầu, hệ thống tự tạo tài khoản Quản lý chính trong bảng `admins` với mật khẩu đã băm bằng scrypt. **Không đưa mật khẩu thật vào `.env.example`, source code hoặc GitHub.**

Nếu nâng cấp từ v1.0.1, hãy chạy lại toàn bộ `supabase/schema.sql` trong Supabase SQL Editor trước khi deploy v1.1.0; file dùng `create table if not exists` nên không xóa dữ liệu thống kê cũ.

## 1. Tạo Supabase

1. Tạo project Supabase.
2. Mở SQL Editor.
3. Chạy toàn bộ file `supabase/schema.sql`.
4. Lấy `Project URL` và **server secret/service-role key**.

> Key server tuyệt đối không đưa vào frontend hoặc repository public.

## 2. Chạy local

```bash
npm install
cp .env.example .env
# điền biến môi trường
npm start
```

Mở `http://localhost:3000`.

## 3. Deploy Vercel

1. Push toàn bộ project này lên GitHub.
2. Import repo vào Vercel.
3. Thêm các Environment Variables giống `.env.example`.
4. Deploy.
5. Kiểm tra `/health`. Nếu trả JSON có `"ok": true`, backend đã được route đúng.
6. Sau đó mới thử đăng nhập. Nếu Vercel đã deploy bản cũ, hãy Redeploy sau khi push v1.1.2.

**Quan trọng:** bản v1.1.2 không có `vercel.json`. Hãy để Vercel tự phát hiện Express (zero-config). Root Directory phải là thư mục chứa trực tiếp `server.js`, `package.json` và `public/`. Không tự thêm rewrite `/api/*` vào `server.js`.

## 4. Kết nối website nhân vật

Không gửi `ANALYTICS_INGEST_KEY` từ browser. Mỗi website nhân vật nên có endpoint backend cùng domain để proxy sự kiện sang website quản lý.

Xem `integration/INTEGRATION_GUIDE.md`.

## 5. AI giáo viên

AI chỉ nhận snapshot thống kê do backend tính từ database. AI không được tự truy vấn SQL và không được dùng kiến thức bên ngoài để trả lời câu hỏi lịch sử hay câu hỏi ngoài lề.

Thông báo từ chối cố định:

> Tôi chỉ hỗ trợ phân tích dữ liệu hoạt động, mức độ quan tâm và hiệu quả sử dụng của hệ thống nhân vật lịch sử.