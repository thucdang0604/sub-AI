# Tích hợp IDE (Cursor / Antigravity)

Công cụ `sub-AI` hỗ trợ giao thức **Model Context Protocol (MCP)**, cho phép các AI IDEs như Cursor hoặc công cụ như Antigravity gọi trực tiếp các tính năng phân tích kiến trúc dự án. 

Dưới đây là cách bạn có thể cấu hình IDE để sử dụng công cụ này.

## Các Công Cụ Khả Dụng (MCP Tools)
Khi tích hợp thành công, IDE của bạn sẽ có thể tự động gọi các tool sau để hỗ trợ quá trình phân tích code:
1. `analyze_project(targetDir)`: Phân tích toàn bộ kiến trúc thư mục dự án và tạo bản đồ phụ thuộc `AI_FILE_MAP.md`.
2. `get_ai_file_map(targetDir)`: Lấy toàn cảnh kiến trúc dự án để hiểu cách các module tương tác với nhau.
3. `get_file_impact(targetDir, fileId)`: Xem mức độ ảnh hưởng của một file cụ thể (nó đang gọi ai, và những file nào đang phụ thuộc vào nó). Rất hữu ích trước khi AI đề xuất thay đổi code.

---

## 1. Cấu hình cho Cursor
Cursor hỗ trợ MCP trực tiếp từ phần Settings.

1. Mở **Cursor Settings** (nhấn `Cmd/Ctrl + Shift + J`).
2. Mở sang tab **Features** -> cuộn xuống phần **MCP**.
3. Nhấp vào **+ Add New MCP Server**.
4. Cấu hình theo thông tin sau:
   - **Name**: `sub-ai-mcp`
   - **Type**: `command`
   - **Command**: `npm` (hoặc `node`)
   - **Args**: `run cli mcp` (hoặc đường dẫn tuyệt đối đến file cli `bin/cli.ts mcp`)
   
   *Lưu ý: Nếu Cursor gặp lỗi khi chạy `npm run cli mcp`, hãy cung cấp đường dẫn tuyệt đối chạy qua `tsx`. Ví dụ: `npx tsx <đường-dẫn-đến-sub-ai>/bin/cli.ts mcp`.*

5. Nhấp Save. Bạn sẽ thấy danh sách các Tools hiện lên (như `analyze_project`, `get_file_impact`).
6. Khi Chat với Cursor, bạn có thể nói: *"Dùng sub-ai-mcp để analyze_project thư mục này"* hoặc *"Phân tích mức độ ảnh hưởng của file Header.tsx bằng sub-ai-mcp"*.

---

## 2. Cấu hình cho Antigravity (hoặc Cline/RooCode)
Antigravity và các client MCP tương tự cấu hình thông qua file `mcp.json` hoặc cấu hình Server MCP trực tiếp trong Extension settings.

### Cấu hình `mcp.json`:
Bạn có thể thiết lập như sau (thay đường dẫn cho phù hợp):

```json
{
  "mcpServers": {
    "sub-ai": {
      "command": "npx",
      "args": ["tsx", "C:/path/to/sub-AI/bin/cli.ts", "mcp"],
      "env": {}
    }
  }
}
```

### Sử dụng với Antigravity
Khi Server MCP được kích hoạt, Antigravity Agent sẽ tự động nhận thức được sự tồn tại của các công cụ này. Khi người dùng yêu cầu:
- *"Hãy quét lại toàn bộ kiến trúc dự án của tôi"*
- *"Trước khi sửa file Button.tsx, hãy kiểm tra xem file này đang được dùng ở đâu (file_impact)"*

Antigravity sẽ tự động gọi các MCP Tool tương ứng để nạp bối cảnh vào Context Window của mình thay vì phải đọc file hoặc regex thủ công.

---

## 🚀 Đề xuất luồng làm việc với IDE
1. Khi bắt đầu dự án mới, hãy yêu cầu AI: *"Hãy gọi analyze_project để quét kiến trúc mã nguồn"*.
2. Khi muốn thêm tính năng lớn, hãy yêu cầu: *"Hãy get_ai_file_map để hiểu tổng quan kiến trúc, sau đó đề xuất những file cần sửa"*.
3. Khi debug hoặc refactor, hãy yêu cầu: *"Hãy gọi get_file_impact cho file X để đảm bảo không làm gãy các file khác"*.
