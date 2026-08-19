# Kết nối website nhân vật với hệ thống quản lý

## Nguyên tắc

- Browser của người học KHÔNG được biết `ANALYTICS_INGEST_KEY`.
- Website nhân vật gửi sự kiện tới backend cùng domain của chính nó.
- Backend website nhân vật mới chuyển tiếp sang website quản lý.

## Biến môi trường thêm vào website nhân vật

```env
ANALYTICS_API_URL=https://YOUR-MANAGER.vercel.app
ANALYTICS_INGEST_KEY=YOUR_SHARED_SECRET
```

## Đoạn proxy thêm vào `server.js` của website nhân vật

```js
app.post('/analytics-event', async (req, res) => {
  try {
    const base = String(process.env.ANALYTICS_API_URL || '').replace(/\/$/, '');
    const key = process.env.ANALYTICS_INGEST_KEY;
    if (!base || !key) return res.status(503).json({ ok: false, error: 'Analytics not configured' });

    const response = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-analytics-key': key
      },
      body: JSON.stringify(req.body || {})
    });

    const data = await response.json().catch(() => ({ ok: false }));
    res.status(response.status).json(data);
  } catch {
    res.status(502).json({ ok: false, error: 'Analytics unavailable' });
  }
});
```

## Payload frontend gửi về `/analytics-event`

```json
{
  "eventId": "optional-unique-event-id",
  "sessionId": "session-uuid",
  "visitorId": "persistent-browser-visitor-id",
  "participant": {
    "name": "Nguyễn Văn A",
    "className": "8A1",
    "schoolName": "THCS Ví Dụ"
  },
  "character": {
    "slug": "trung-trac",
    "nameVi": "Trưng Trắc",
    "nameEn": "Trung Trac"
  },
  "language": "vi",
  "eventType": "roleplay_choice",
  "feature": "Nhập vai quyết sách",
  "content": "Liên kết các Lạc tướng",
  "durationSeconds": 180,
  "metadata": {
    "turn": 2
  },
  "occurredAt": "2026-08-18T16:10:00+07:00"
}
```

## Event nên ghi

- `page_view`
- `profile_open`
- `timeline_view`
- `narration_play`
- `narration_pause`
- `ask_question`
- `whatif_question`
- `roleplay_start`
- `roleplay_choice`
- `roleplay_new_scenario`
- `roleplay_end`
- `favorite_add`
- `favorite_remove`
- `pdf_export`
- `language_change`

## Quy ước thống kê

- **Người tham gia**: distinct `visitorId`. Tên bắt buộc; lớp/trường có thể rỗng.
- **Được yêu thích**: chỉ dựa vào sự kiện `favorite_add` (nếu website có nút yêu thích).
- **Được quan tâm**: xem participants + sessions + interactions; không đồng nhất với yêu thích.
- **Ai truy cập nhiều nhất**: xếp theo interactions/sessions của participant.


## Tích hợp Trưng Trắc v5.8.4
Website Trưng Trắc dùng backend proxy:
- Browser gọi `/analytics-event` trên chính website Trưng Trắc.
- Backend Trưng Trắc đọc `ANALYTICS_API_URL` và `ANALYTICS_INGEST_KEY`.
- Backend mới gọi `POST /api/events` của website quản lý với `x-analytics-key`.
- Không đưa `ANALYTICS_INGEST_KEY` vào frontend.

Vercel của website Trưng Trắc:
```env
ANALYTICS_API_URL=https://quan-ly-s7j8.vercel.app
ANALYTICS_INGEST_KEY=<giống website quản lý>
```
