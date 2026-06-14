const ARTICLE_CONTENT = {
  1: {
    title: "5 bước chạy chiến dịch Zalo nhóm không bị coi spam",
    image: "./assets/article-campaign.svg",
    body: [
      "Bước 1: Tạo chiến dịch riêng cho từng đợt sale hoặc sản phẩm — tránh trộn nội dung.",
      "Bước 2: Soạn tin khác nhau cho từng nhóm (personalize tên nhóm / ngữ cảnh).",
      "Bước 3: Gán người phụ trách trước khi gửi — biết ai follow-up sau broadcast.",
      "Bước 4: Cập nhật trạng thái Đã gửi → Đang trả lời → Hoàn tất ngay trong ngày.",
      "Bước 5: Export CSV cuối tuần để review lead nóng và nhóm quá hạn follow-up.",
    ],
  },
  2: {
    title: "Vì sao shop mất 30% lead vì quên nhắc follow-up",
    image: "./assets/article-followup.svg",
    body: [
      "Lead trong nhóm Zalo thường “nguội” sau 24–48h nếu không ai nhắc lại.",
      "Dùng lọc Quá hạn và Hôm nay để ưu tiên nhóm cần chăm ngay.",
      "Nút +24h / +48h giúp đặt lịch nhanh sau mỗi lần liên hệ.",
      "Gán assignee rõ ràng — tránh tình trạng “ai cũng tưởng người kia follow”.",
    ],
  },
  3: {
    title: "Phân quyền: ai soạn tin, ai cập nhật trạng thái trả lời?",
    image: "./assets/article-team.svg",
    body: [
      "Admin: thêm/xóa nhóm, chiến dịch, cấu hình chung.",
      "Editor: soạn nội dung tin, file đính kèm, lead score, lịch follow-up.",
      "Responder: chỉ cập nhật trạng thái trả lời — phù hợp CSKH tuyến sau.",
      "Workflow này giảm sửa nhầm nội dung khi nhiều người cùng vào CRM.",
    ],
  },
  4: {
    title: "Chấm điểm lead 0–100: ưu tiên nhóm nào trước?",
    image: "./assets/article-lead.svg",
    body: [
      "80–100: Nhóm vừa hỏi giá / đặt hàng / tương tác mạnh trong 24h.",
      "50–79: Có quan tâm nhưng chưa chốt — cần follow trong 48h.",
      "Dưới 50: Mới vào nhóm hoặc im lặng lâu — nurture dài hạn.",
      "Kết hợp lọc Độ nóng + Sắp xếp điểm lead để team sale biết gọi ai trước.",
    ],
  },
  5: {
    title: "Export CSV cuối tuần cho sếp & khách hàng",
    image: "./assets/article-csv.svg",
    body: [
      "Chọn đúng chiến dịch đang chạy → lọc trạng thái cần báo cáo.",
      "Export gồm: nhóm, assignee, điểm, trạng thái, follow-up, nội dung tin.",
      "Agency gửi file cho brand; shop gửi cho trưởng nhóm review KPI.",
      "Mẹo: export theo bộ lọc (VD chỉ quá hạn) để họp sáng thứ 2.",
    ],
  },
  6: {
    title: "Vì sao không auto gửi tin Zalo trong CRM này?",
    image: "./assets/article-safe.svg",
    body: [
      "Auto broadcast dễ vi phạm chính sách và bị user report spam.",
      "Tin cá nhân hóa từng nhóm thường có tỷ lệ phản hồi cao hơn.",
      "CRM tập trung quy trình & trách nhiệm — không thay Zalo Official API.",
      "Hướng phát triển: tích hợp nhắc việc, không tích hợp auto-send.",
    ],
  },
};

const articleModal = document.getElementById("article-modal");
const articleModalContent = document.getElementById("article-modal-content");
const articleModalClose = document.getElementById("article-modal-close");

document.querySelectorAll("[data-article]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openArticleModal(el.getAttribute("data-article"));
  });
});

articleModalClose?.addEventListener("click", () => articleModal?.close());
articleModal?.addEventListener("click", (e) => {
  if (e.target === articleModal) articleModal.close();
});

function openArticleModal(id) {
  const article = ARTICLE_CONTENT[id];
  if (!article || !articleModalContent) return;
  articleModalContent.innerHTML = `
    <img src="${article.image}" alt="" width="400" height="240" />
    <h3>${escapeHtml(article.title)}</h3>
    ${article.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
  `;
  articleModal?.showModal();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
