# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG QUẢN LÝ BẢO TÀNG LỊCH SỬ TƯƠNG TÁC

## 1. Đăng nhập
- Mở website quản lý và nhập **Tên quản lý** + **Mật khẩu**.
- Quản lý chính có thêm quyền quản lý tài khoản và xóa vĩnh viễn dữ liệu quản trị.
- Quản lý thường không thể tự cấp thêm quyền quản lý.

## 2. Tổng quan
Dashboard hiển thị số nhân vật đang hoạt động, người tham gia, phiên học, tổng lượt tương tác và tổng thời gian sử dụng.

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
Trang quản lý hiển thị tên tiếng Việt dễ hiểu cho các hoạt động, ví dụ: Bắt đầu phiên học, Mở hồ sơ, Nghe thuyết minh, Tra cứu sử liệu, Hỏi Giả định lịch sử, Bắt đầu Nhập vai, Chọn phương án nhập vai và Đổi ngôn ngữ.

## 6. AI phân tích
AI chỉ phân tích dữ liệu quản lý/thống kê của hệ thống. Nếu câu hỏi ngoài phạm vi, AI từ chối.
- **Được quan tâm**: dựa trên người tham gia, phiên và tương tác.

## 7. Quản lý tài khoản
Chỉ Quản lý chính có thể tạo quản lý, đặt lại mật khẩu, thu hồi/khôi phục quyền và xóa tài khoản quản lý đã bị thu hồi. Không thể xóa tài khoản Quản lý chính.

## 8. Thêm nhân vật mới
Đăng ký Slug + tên trong Dashboard, sau đó website nhân vật mới gửi sự kiện về cùng `ANALYTICS_API_URL` và dùng cùng `ANALYTICS_INGEST_KEY`.

## Mã nội bộ người tham gia
Các chuỗi dài như UUID chỉ là mã kỹ thuật dùng bên trong hệ thống để phân biệt bản ghi. Giáo viên không cần sử dụng mã này. Giao diện và AI không hiển thị mã nội bộ; nếu thiếu tên, hệ thống dùng nhãn dễ hiểu như “Người tham gia #01”.
