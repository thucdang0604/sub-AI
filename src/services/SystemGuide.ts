/**
 * SystemGuide — Markdown documentation for Sub-AI system
 * 
 * Extracted from ChatExtension.ts (Issue #10 God File refactor)
 */

export function getSystemGuideMarkdown(): string {
    return `# 📖 Hướng dẫn Sử dụng Sub-AI — Hệ thống Phân tích Kiến trúc Thông minh

## 🎯 Tổng quan
Sub-AI là một hệ thống AI cục bộ hỗ trợ phân tích kiến trúc mã nguồn, tìm kiếm ngữ nghĩa (Semantic Search),
đánh giá sức khoẻ dự án, và đề xuất cải tiến — tất cả chạy hoàn toàn trên máy của bạn, tận dụng **Intel NPU** và **Ollama**.

---

## 🖥️ Giao diện Dashboard (Web UI)

Dashboard được chia thành **6 tab chính** ở sidebar bên phải:

### 1. 💬 Tab Trò chuyện (Chat)
- **Mục đích:** Tương tác trực tiếp với AI về kiến trúc dự án
- **Cách dùng:**
  - Nhập câu hỏi vào ô chat, ví dụ: \\\`"Giải thích file Server.ts làm gì?"\\\`
  - **Click node** trên đồ thị → chọn hành động: Tóm tắt, Phân tích ảnh hưởng, Audit
  - **Shift+Click** để chọn nhiều node cùng lúc
- **Lịch sử:** Bấm icon ⏳ để xem và khôi phục các phiên chat cũ

### 2. 🗄️ Tab RAG (Knowledge Base)
- **Mục đích:** Quản lý cơ sở dữ liệu vector cục bộ
- **Các bước:**
  1. Phân tích dự án trước (nhập đường dẫn → bấm Phân tích)
  2. Bấm **"Index Project"** để bắt đầu quét và sinh embeddings
  3. Theo dõi tiến trình qua **thanh progress bar** và **activity logs** realtime
  4. Sau khi index xong, nhập câu hỏi ở ô tìm kiếm, ví dụ: \\\`"Hàm xử lý authentication"\\\`
- **Chi tiết kỹ thuật:**
  - Embeddings: \\\`bge-m3-openvino\\\` (1024 chiều) chạy trên **Intel NPU**
  - Tóm tắt code: Ollama LLM (model tùy chọn)
  - Tìm kiếm: Hybrid (Vector + Full-Text Search) kết hợp thuật toán RRF

### 3. 📊 Tab Tính năng (Features)
- **Mục đích:** Nhóm các file theo feature/chức năng
- **Cách dùng:**
  - Bấm **"Đánh giá Tính năng"** để AI phân nhóm và đánh giá toàn bộ
  - Click **"🔍 Phân tích"** trên từng cụm feature để xem chi tiết
  - Chuyển chế độ hiển thị đồ thị: Force / Architecture / Features
  - Xuất báo cáo dạng Markdown bằng nút Export

### 4. 🏥 Tab Sức khoẻ (Health)
- **Mục đích:** Dashboard chẩn đoán sức khoẻ kiến trúc
- **Các chỉ số:**
  | Chỉ số | Mô tả | Ngưỡng cảnh báo |
  |--------|--------|-----------------|
  | ⚠ God Files | File quá lớn, quá nhiều dependency | >500 dòng VÀ >5 importers |
  | ⚡ High Fan-out | File import quá nhiều file khác | >10 imports |
  | 💀 Dead Exports | Export không ai sử dụng | 0 importers |
  | 🔗 File Mồ Côi | Không được import, không phải entry | Không có liên kết |
  | 🔄 Circular Deps | Dependency vòng tròn (A→B→A) | Bất kỳ |
- **🤖 AI Audit:** Bấm **"Bắt đầu AI Audit"** để AI đưa ra kế hoạch refactoring ưu tiên

### 5. ⚙️ Tab Cài đặt (Settings)
- **Chọn Model AI:** Dropdown hiển thị tất cả model Ollama/OpenAI/Gemini khả dụng
- **API Keys:** Nhập OpenAI hoặc Gemini API key (tuỳ chọn)
- **Cấu hình vật lý đồ thị:** Điều chỉnh khoảng cách cụm, lực đẩy, lực hút

### 6. 📖 Tab Hướng dẫn (Tab này)
- Hiển thị tài liệu hướng dẫn sử dụng chi tiết

---

## 🔧 Tích hợp MCP (Model Context Protocol)

Sub-AI cung cấp **8 MCP tools** cho các AI agent bên ngoài (Gemini, Cursor, etc.):

| Tool | Mô tả |
|------|--------|
| \\\`analyze_project\\\` | Phân tích kiến trúc, tạo AI_FILE_MAP.md |
| \\\`get_ai_file_map\\\` | Đọc bản đồ kiến trúc đã tạo |
| \\\`get_file_impact\\\` | Phân tích ảnh hưởng của 1 file cụ thể |
| \\\`get_health_report\\\` | Lấy báo cáo sức khoẻ toàn diện |
| \\\`index_codebase\\\` | Khởi tạo RAG — quét và sinh embeddings |
| \\\`semantic_search_code\\\` | Tìm kiếm ngữ nghĩa trong codebase |
| \\\`get_micro_context\\\` | Lấy nội dung chi tiết 1 code chunk |
| \\\`get_project_guidelines\\\` | Đọc các file quy ước dự án |
| \\\`get_system_guide\\\` | Đọc hướng dẫn sử dụng hệ thống |

---

## ⚡ Kiến trúc Hệ thống

\\\`\\\`\\\`
┌──────────────────────────────────────────────────┐
│                 Web Dashboard (Vue 3)            │
│  Chat │ RAG │ Features │ Health │ Settings │ Guide│
└──────────┬───────────────────────────────────────┘
           │ REST API + SSE
┌──────────▼───────────────────────────────────────┐
│              Node.js Server (Server.ts)          │
│  ┌─────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │ Ollama  │ │ NPU Bridge   │ │ Graph Analyzer│ │
│  │ Manager │ │ (bge-m3-ov)  │ │ (TypeScript)  │ │
│  └────┬────┘ └──────┬───────┘ └───────┬───────┘ │
│       │             │                 │         │
│  ┌────▼────────────▼─────────────────▼───────┐ │
│  │     LocalKnowledgeBaseService (RAG)        │ │
│  │  SQLite + sqlite-vec │ FTS5 │ Hybrid RRF   │ │
│  └───────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
           │ stdio JSON
┌──────────▼───────────────────────────────────────┐
│           MCP Server (McpServer.ts)              │
│        Kết nối với Gemini / Cursor / v.v.        │
└──────────────────────────────────────────────────┘
\\\`\\\`\\\`

---

## 🚀 Khởi động Nhanh

1. **Đảm bảo Ollama đang chạy** trên máy (mặc định port 11434)
2. Chạy \\\`npm run start\\\` trong thư mục Sub-AI
3. Mở trình duyệt tại \\\`http://localhost:3000\\\`
4. Nhập đường dẫn dự án → Bấm **Phân tích**
5. Bấm **Index Project** để tạo vector database
6. Bắt đầu tương tác: Chat, Search, Audit!

> **Lưu ý:** Lần đầu index sẽ mất vài phút tuỳ kích thước dự án. Các lần sau sẽ nhanh hơn nhờ cache MD5.
`;
}
