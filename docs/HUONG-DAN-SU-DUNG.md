# Hướng dẫn sử dụng Zalo Campaign CRM

> Bản đầy đủ có giao diện đẹp: mở file **`docs/Huong-dan-su-dung.html`** bằng Chrome → In → Lưu PDF.

---

## CRM làm gì / không làm gì

| Làm | Không làm |
|-----|-----------|
| Quản lý ~300 nhóm, chiến dịch, tin riêng từng nhóm | Không thay app Zalo |
| Phân quyền team, theo dõi đã gửi / follow-up | Không auto spam 1000 tin/ngày |
| Gửi Web hỗ trợ (ngầm qua chat.zalo.me) | Không tự gửi file đính kèm lên Zalo |
| Thông báo hàng loạt (1 tin → nhiều nhóm) | Không sync magic khi mới mở Zalo |

---

## 1. Chuẩn bị

```bat
cd zalo-crm-mvp
npm.cmd start
```

Mở: http://localhost:3000/login.html

| Vai trò | User | Pass |
|---------|------|------|
| Admin | admin | admin123 |
| Soạn tin | editor | editor123 |
| Trả lời | responder | responder123 |

---

## 2. Extension Chrome (một lần)

1. Chrome → Extensions → Developer mode → **Load unpacked** → `tools/zalo-sync-extension`
2. CRM → **Đồng bộ Zalo** → **Tạo mã đồng bộ** → F5 CRM
3. Mở https://chat.zalo.me/ → đăng nhập → giữ tab mở

---

## 3. Quy trình 3 bước

### Bước 1 — Import nhóm

Menu **Nhóm & chiến dịch** → **Import nhóm từ Zalo / CSV**

- Extension: **Quét nhóm → gửi CRM**
- CRM: **Hiện danh sách vừa quét** → **Chỉ import: Nhóm Zalo** → **Import vào CRM**

**Tìm nhóm:** ô **Tìm tên nhóm…** (viền xanh). Không dùng ô «Thêm nhóm thủ công» để search.

### Bước 2 — Tạo chiến dịch

Cột phải → nhập tên → **Tạo chiến dịch** → bấm **Soạn tin →**

### Bước 3 — Gửi tin

Menu **Công việc** → chọn chiến dịch → soạn tin → **Gửi Web** (hoặc Mở Zalo gửi tay → đổi trạng thái **Đã gửi**)

---

## 4. Các menu

- **Công việc** — hàng ngày: soạn, gửi, trạng thái
- **Nhóm & chiến dịch** — import, tìm nhóm, tạo chiến dịch
- **Tổng quan** — số liệu, hiệu suất nhân viên
- **Thông báo** — 1 nội dung nhiều nhóm (ít dùng)
- **Đồng bộ Zalo** — mã sync, trạng thái extension
- **Inbox / Cài đặt** — nâng cao

---

## 5. Thông báo hàng loạt

Menu **Thông báo** → Tạo → chọn nhiều nhóm → **Gửi Web** từng nhóm hoặc hàng loạt.

---

## 6. File đính kèm

Thẻ nhóm → **Chi tiết** → **+ Thêm file**. File lưu CRM; gửi kèm **tay trên Zalo**.

---

## 7. Checklist test

- [ ] Login admin
- [ ] Extension + mã sync
- [ ] Import nhóm từ Zalo
- [ ] Tạo chiến dịch
- [ ] Gửi Web 1 nhóm → Đã gửi

---

*Tài liệu cập nhật: 2026-05*
