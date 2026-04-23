# 📘 Hướng Dẫn Sử Dụng sub-AI

`sub-AI` là một hệ thống phân tích kiến trúc mã nguồn và quản lý ngữ cảnh (Context Management) cực kỳ mạnh mẽ dành riêng cho quá trình lập trình với AI (AI-Assisted Coding). Công cụ này giúp LLM và các Agent lập trình hiểu rõ cấu trúc dự án của bạn một cách chính xác nhất với lượng Token nhỏ nhất.

---

## 🌟 1. Lợi Ích & Công Dụng Rõ Ràng

Khi lập trình với các AI Assistants hiện tại (như ChatGPT, Claude, hay Copilot), các rào cản lớn nhất luôn là:
- **Giới hạn Context Window:** Ném toàn bộ codebase vào prompt sẽ làm tràn token hoặc khiến AI bị "loãng" ngữ cảnh, trả lời sai lệch (hallucinations).
- **Phá vỡ kiến trúc (Breaking Changes):** AI thường chỉ nhìn thấy 1-2 file bạn đang mở. Khi AI sửa hàm trong file A, nó không biết rằng file B, C, D đang gọi hàm đó, dẫn đến hỏng toàn bộ hệ thống.
- **Tiêu tốn chi phí:** Gửi lặp đi lặp lại hàng nghìn dòng code mỗi lượt chat tốn rất nhiều tiền (nếu dùng API) và thời gian phản hồi.

### Cách `sub-AI` giải quyết:
- 🎯 **Trích xuất thông tin siêu nén:** Thay vì đọc từng dòng code của 100 file, `sub-AI` quét AST (Cây cú pháp trừu tượng) và chỉ trích xuất các mối liên hệ (ai gọi ai, hàm nào export).
- 🛡️ **Bảo vệ toàn vẹn (Impact Analysis):** Cung cấp công cụ cho phép bạn (và AI) kiểm tra chính xác *"Nếu tôi sửa hàm này, những module nào khác sẽ bị ảnh hưởng?"*.
- 💰 **Tiết kiệm 80-90% lượng Token:** AI chỉ nhận được `AI_FILE_MAP.md` (chứa tóm tắt siêu ngắn) hoặc chỉ truy vấn đúng file cần thiết thay vì toàn bộ mã nguồn.

---

## 💻 2. Sử Dụng Riêng Lẻ (Standalone Web UI / CLI)

Chế độ này phù hợp khi bạn muốn tự mình rà soát kiến trúc dự án hoặc dùng AI Local hoàn toàn miễn phí để tóm tắt code.

### Khởi động công cụ:
Mở terminal tại thư mục bạn muốn phân tích và chạy lệnh:
```bash
npx tsx <đường-dẫn-sub-AI>/bin/cli.ts scan
```
*(Thay thế `<đường-dẫn-sub-AI>` bằng thư mục chứa source code của sub-AI).*

Khởi động Web UI:
```bash
# Tại thư mục chứa sub-AI
npm run start
```
Vào trình duyệt mở `http://localhost:3333`.

### Các tính năng trong Web UI:
1. **Interactive Graph:** Quan sát toàn bộ codebase dưới dạng đồ thị 3D/2D trực quan. Các Node lớn là những file quan trọng được nhiều file khác import.
2. **AI Node Panel:** Click vào một node (file) bất kỳ để mở bảng điều khiển bên phải.
   - Chọn **Summarize**: Nhờ AI tóm tắt chức năng của file.
   - Chọn **Impact Analysis**: Hỏi AI xem nếu refactor file này thì cần lưu ý sửa ở những đâu.
3. **Cấu hình Local / Cloud AI:** Nhấn nút ⚙️ Settings để cấu hình dùng OpenAI, Gemini hoặc chạy **Ollama (Miễn phí 100% offline)**.

---

## 🔌 3. Sử Dụng Khi Tích Hợp (Với Antigravity / Cursor / IDEs)

Đây là sức mạnh thực sự của `sub-AI`. Thông qua giao thức **MCP (Model Context Protocol)**, IDE của bạn sẽ "mọc thêm mắt", tự động phân tích và hiểu rõ dự án.

### Bước 1: Khởi tạo
Khi bắt đầu phiên làm việc mới trên Cursor hoặc Antigravity, bạn chỉ cần gõ vào khung chat:
> *"Hãy dùng sub-ai-mcp quét lại toàn bộ kiến trúc dự án này."*

Ngay lập tức, Agent sẽ tự động chạy tool `analyze_project`. Kết quả trả về cho Agent không phải là hàng nghìn dòng code dư thừa, mà là một bản đồ phụ thuộc tinh gọn (`AI_FILE_MAP.md`).

### Bước 2: Yêu cầu sửa đổi có ngữ cảnh
Khi yêu cầu AI viết tính năng mới hoặc sửa bug:
> *"Thêm trường 'is_active' vào interface User. Trước khi làm, hãy dùng get_file_impact để xem những file nào đang import User interface và cập nhật chúng luôn thể."*

AI sẽ tự động gọi tool `get_file_impact("src/domain/types.ts")`, nhận về danh sách chính xác các file đang bị phụ thuộc, và tiến hành sửa đồng loạt mà không bỏ sót bất kỳ file nào.

---

## 📊 4. Có Thể Xem Mức Token/Quota Tiết Kiệm Được Ở Đâu?

Hiện tại, cơ chế tiết kiệm Token của `sub-AI` được thể hiện rõ ràng nhất thông qua **Log của Terminal** và **Độ dài file Context**. 

1. **Xem độ nén ngữ cảnh:** Khi bạn chạy lệnh CLI, hệ thống sẽ in ra số dòng của bản đồ ngữ cảnh (Context Map).
   ```text
   ✅ AI Map → Saved to M:\your-project (62 lines)
   ```
   *Giải thích:* Thay vì gửi 12 file mã nguồn với tổng số hơn `3.000` dòng code vào Context của LLM (chiếm khoảng `30.000 tokens`), `sub-AI` nén toàn bộ hệ thống phụ thuộc lại chỉ còn **62 dòng văn bản (khoảng 800 tokens)**. Bạn đã tiết kiệm được **~95%** lượng token tiêu thụ mỗi lượt chat.

2. **Xem trong IDE (Antigravity/Cursor):**
   - Trong quá trình chat, bạn sẽ thấy Agent gọi tool `get_file_impact`. Phản hồi của tool này gửi về cho AI chỉ bao gồm 1 file JSON cực nhẹ (tầm vài chục dòng) chỉ định rõ file nào phụ thuộc file nào.
   - Bạn có thể kiểm tra lượng Token tiêu thụ ở cửa sổ Chat/Log của Antigravity/Cursor. Bạn sẽ thấy mức sử dụng Context tụt giảm đáng kể so với việc dùng tính năng *Add entire folder* truyền thống.

3. **Với Web UI chạy Local:**
   - Nếu bạn cấu hình chạy bằng Ollama (Local AI), bạn tiết kiệm **100% chi phí API Quota**. Toàn bộ dữ liệu của bạn không bao giờ rời khỏi máy tính cá nhân, bảo mật tuyệt đối cho những đoạn code nhạy cảm.
