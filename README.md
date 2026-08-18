# HISTORY ANALYTICS MANAGER v1.0.1

> Bản v1.0.1 sửa lỗi giao diện bị hiển thị như HTML thô trên Vercel. Nguyên nhân của v1.0.0 là `vercel.json` rewrite toàn bộ request (kể cả `/styles.css` và `/app.js`) vào `server.js`. Trên Vercel, static assets trong `public/` phải được CDN phục vụ trực tiếp. Bản này bỏ catch-all rewrite và thêm cache-busting cho CSS/JS.

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
5. Kiểm tra `/health`.

## 4. Kết nối website nhân vật

Không gửi `ANALYTICS_INGEST_KEY` từ browser. Mỗi website nhân vật nên có endpoint backend cùng domain để proxy sự kiện sang website quản lý.

Xem `integration/INTEGRATION_GUIDE.md`.

## 5. AI giáo viên

AI chỉ nhận snapshot thống kê do backend tính từ database. AI không được tự truy vấn SQL và không được dùng kiến thức bên ngoài để trả lời câu hỏi lịch sử hay câu hỏi ngoài lề.

Thông báo từ chối cố định:

> Tôi chỉ hỗ trợ phân tích dữ liệu hoạt động, mức độ quan tâm và hiệu quả sử dụng của hệ thống nhân vật lịch sử.