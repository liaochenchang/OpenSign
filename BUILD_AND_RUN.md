# OpenSign 繁體中文版建置與執行指南

## 已完成的修改

### 1. 繁體中文語系支援
- ✅ 建立繁體中文翻譯檔案：`apps/OpenSign/public/locales/zh-TW/translation.json`
- ✅ 更新 i18n 配置：`apps/OpenSign/src/i18n.js`
  - 將預設語言設定為繁體中文 (`zh-TW`)
  - 在允許語言清單中新增繁體中文
- ✅ 更新語言選擇器：`apps/OpenSign/src/components/pdf/SelectLanguage.jsx`
  - 新增繁體中文選項並設為第一位
  - 更新預設語言為繁體中文

### 2. Docker 建置配置
- ✅ 建立前端 Dockerfile：`apps/OpenSign/Dockerfile`
- ✅ 修改 docker-compose.yml 使用本地建置
- ✅ 前端應用程式已建置完成 (build 資料夾)

## 建置與執行步驟

### 方法一：使用 Docker Compose (推薦)

```bash
# 1. 切換到專案根目錄
cd /mnt/e/Project/OpenSign

# 2. 建置並啟動所有服務
docker compose up --build

# 或者在背景執行
docker compose up --build -d
```

### 方法二：分別建置 Docker 映像檔

```bash
# 1. 建置前端映像檔
cd /mnt/e/Project/OpenSign/apps/OpenSign
docker build -t opensign-frontend-zh-tw:latest .

# 2. 切換回根目錄並啟動服務
cd /mnt/e/Project/OpenSign
docker compose up
```

## 服務存取

建置完成後，您可以透過以下網址存取服務：

- **OpenSign 主應用程式**: http://localhost:3001
- **前端服務 (直接)**: http://localhost:3000  
- **後端 API**: http://localhost:8080
- **MongoDB**: localhost:27018

## 測試繁體中文功能

1. 開啟瀏覽器前往 http://localhost:3001
2. 應用程式應該預設顯示繁體中文介面
3. 您可以在語言選擇器中切換到其他語言測試
4. 確認所有 UI 元素都正確顯示繁體中文

## 停止服務

```bash
# 停止所有服務
docker compose down

# 停止並移除所有容器、網路和儲存卷
docker compose down --volumes --remove-orphans
```

## 故障排除

### 如果建置失敗
1. 確認 Docker 和 Docker Compose 已正確安裝
2. 檢查是否有足夠的磁碟空間
3. 確認網路連線正常（需要下載依賴套件）

### 如果語言沒有正確載入
1. 清除瀏覽器快取
2. 檢查瀏覽器開發者工具的 Console 是否有錯誤
3. 確認翻譯檔案路徑正確：`/locales/zh-TW/translation.json`

## 檔案結構

```
/mnt/e/Project/OpenSign/
├── apps/
│   ├── OpenSign/                    # 前端應用程式
│   │   ├── Dockerfile              # 新建立的 Dockerfile
│   │   ├── public/locales/zh-TW/   # 繁體中文翻譯檔案
│   │   └── src/i18n.js             # 已修改的語言配置
│   └── OpenSignServer/             # 後端 API 服務
├── docker-compose.yml              # 已修改使用本地建置
└── .env.prod                       # 環境配置檔案
```