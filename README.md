# Trạm Toán 6

Trang chủ, đăng nhập và lớp học được xuất thành HTML trong public/. Mã API nằm trong api/, giao diện nguồn nằm trong pages/, cấu trúc dữ liệu nằm trong database/migrations/.

## Xuất HTML

Cài Node.js 22 trở lên, sau đó chạy:

```powershell
npm.cmd install
npm.cmd run build:html
```

Đưa nội dung public/ lên hosting tĩnh. Dùng GitHub Pages bằng cách chọn Settings → Pages → Source → GitHub Actions. Chép deployment/github-pages.yml vào .github/workflows/pages.yml qua GitHub trước khi bật GitHub Pages. Tệp này sẽ build và xuất bản khi push lên main.

## Chạy đầy đủ

Đăng nhập, lưu điểm, ảnh bài làm và email cần API Cloudflare Workers cùng D1. Xem wrangler.toml, tạo D1 rồi thay database_id. Cấu hình GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, TEACHER_EMAILS và Resend trong cấu hình riêng của hosting. Sao chép .dev.vars.example thành .dev.vars để chạy local. Không commit khóa hay mật khẩu.

Chạy migration rồi deploy Worker:

```powershell
npx.cmd wrangler d1 migrations apply DB --remote
npm.cmd run deploy
```

Để dùng trang HTML và API trên cùng miền, cấu hình hosting chuyển /api/* và /auth/* đến Worker. Trường hợp hosting tĩnh độc lập, điền địa chỉ API vào public/config.js và cấu hình CORS cùng cookie trên máy chủ trước khi dùng tài khoản. Triển khai toàn bộ Worker trên một miền là luồng đăng nhập đã có sẵn trong mã nguồn.

Gói này không chứa tài khoản thật, dữ liệu học sinh hoặc khóa gửi email.

