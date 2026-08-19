# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG QUẢN LÝ BẢO TÀNG LỊCH SỬ TƯƠNG TÁC

## 1. Đăng nhập
- Mở website quản lý và nhập **Tên quản lý** + **Mật khẩu**.
- Quản lý chính có thêm quyền quản lý tài khoản và xóa vĩnh viễn dữ liệu quản trị.
- Quản lý thường không thể tự cấp thêm quyền quản lý.

## 2. Tổng quan
Dashboard hiển thị số nhân vật đang hoạt động, người tham gia, phiên học, tổng tương tác, lượt yêu thích (nếu website có ghi nhận) và tổng thời lượng phiên.

### Bộ lọc
Có thể lọc theo Từ ngày / Đến ngày / Nhân vật / Lớp / Trường. Bấm **Áp dụng** để cập nhật thống kê; **Xóa lọc** để trở về toàn bộ dữ liệu.

## 3. Nhân vật
- **Slug** là mã định danh không dấu, ví dụ `ngo-quyen`, `trung-trac`.
- **Tạm ẩn** giữ lại dữ liệu nhưng ngừng đưa nhân vật vào danh sách đang hoạt động.
- Quản lý chính chỉ thấy nút **Xóa** khi nhân vật đã Tạm ẩn.
- Xóa nhân vật là vĩnh viễn và sẽ xóa các phiên/sự kiện thống kê liên quan.

## 4. Người tham gia
Website nhân vật yêu cầu **Tên người tham gia**; Lớp và Trường không bắt buộc. Trang Người tham gia xếp hạng theo số phiên và tương tác.

## 5. Hoạt động
Có thể nhận: `session_start`, `session_end`, `page_view`, `character_open`, `profile_open`, `timeline_view`, `narration_play`, `ask_question`, `whatif_question`, `roleplay_start`, `roleplay_new_scenario`, `roleplay_choice`, `roleplay_end`, `language_change`.

## 6. AI phân tích
AI chỉ phân tích dữ liệu quản lý/thống kê của hệ thống. Nếu câu hỏi ngoài phạm vi, AI từ chối.
- **Được quan tâm**: dựa trên người tham gia, phiên và tương tác.
- **Được yêu thích**: chỉ dựa trên `favorite_add`/`favorite_remove`, không suy diễn từ lượt xem.

## 7. Quản lý tài khoản
Chỉ Quản lý chính có thể tạo quản lý, đặt lại mật khẩu, thu hồi/khôi phục quyền và xóa tài khoản quản lý đã bị thu hồi. Không thể xóa tài khoản Quản lý chính.

## 8. Khi website nhân vật đã dùng nhưng Dashboard chưa có dữ liệu
Trên Vercel website nhân vật phải có:
- `ANALYTICS_API_URL=https://quan-ly-s7j8.vercel.app`
- `ANALYTICS_INGEST_KEY=<cùng giá trị với website quản lý>`

Sau khi thêm/sửa biến:
1. Redeploy website nhân vật.
2. Mở một phiên mới: nhập tên → hoàn tất màn bụi → dùng ít nhất một chức năng.
3. Vào Dashboard quản lý → tải lại hoặc bấm **Áp dụng**.

## 9. Bảo mật
Không đưa `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANALYTICS_INGEST_KEY` vào frontend hoặc GitHub. Chỉ đặt secret trong Vercel Environment Variables.

## 10. Thêm nhân vật mới
Đăng ký Slug + tên trong Dashboard, sau đó website nhân vật mới gửi sự kiện về cùng `ANALYTICS_API_URL` và dùng cùng `ANALYTICS_INGEST_KEY`.
