# Nâng cấp nhanh v1.0.1 → v1.1.0

## 1. Supabase
Mở **SQL Editor** và chạy:

`supabase/migrations/20260818_admin_roles.sql`

Migration chỉ thêm bảng quản lý, không xóa dữ liệu nhân vật/người tham gia/phiên/sự kiện hiện có.

## 2. Vercel Environment Variables
Khuyến nghị thêm:

```env
SUPERADMIN_USERNAME="Nguyễn Minh Anh"
SUPERADMIN_PASSWORD=<mật khẩu Quản lý chính>
ADMIN_SESSION_SECRET=<chuỗi ngẫu nhiên dài ít nhất 32 byte>
```

Nếu project v1.0.1 đang có `ADMIN_PASSWORD`, v1.1.0 vẫn đọc biến cũ **chỉ để bootstrap Quản lý chính lần đầu**. Sau khi tài khoản Quản lý chính đã được tạo trong database, có thể xóa `ADMIN_PASSWORD` cũ.

Không đưa mật khẩu thật hoặc `ADMIN_SESSION_SECRET` lên GitHub.

## 3. Redeploy
Push code v1.1.0 lên GitHub và Redeploy Vercel.

## 4. Đăng nhập
- Tên quản lý: **Nguyễn Minh Anh**
- Mật khẩu: giá trị đã đặt trong `SUPERADMIN_PASSWORD` (hoặc `ADMIN_PASSWORD` cũ trong lần bootstrap đầu).

Sau khi đăng nhập, mục **Quản lý tài khoản** chỉ xuất hiện với Quản lý chính.

## 5. Tạo quản lý mới
Vào **Quản lý tài khoản → Tạo tài khoản mới** → nhập tên + mật khẩu tạm → cung cấp riêng cho người được cấp quyền.

Quản lý chính có thể:
- đặt lại mật khẩu;
- thu hồi quyền ngay lập tức;
- khôi phục quyền;
- xem thời điểm đăng nhập gần nhất.
