# Tetris Battle v3.1 - 部署指南

## 📦 檔案說明

### 後端檔案（部署到 Render）
- `server.js` - Socket.IO 伺服器主程式
- `package.json` - Node.js 依賴套件清單
- `package-lock.json` - 套件版本鎖定檔案

### 前端檔案（部署到 GitHub Pages）
- `index.html` - 遊戲主頁面
- `styles.css` - 遊戲樣式
- `game.js` - 遊戲邏輯（需修改後端連線網址）

## 🚀 部署步驟

### 步驟一：部署後端到 Render

1. **註冊 Render 帳號**
   - 前往 https://render.com
   - 使用 GitHub 帳號註冊（推薦）

2. **建立新的 Web Service**
   - 點選右上角「New +」
   - 選擇「Web Service」
   - 連接您的 GitHub repository（包含後端檔案）

3. **設定服務**
   - **Name**: 自訂名稱（例如：tetris-battle-server）
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - Render 會自動偵測 PORT 環境變數

4. **部署**
   - 點選「Create Web Service」
   - 等待部署完成（約 2-3 分鐘）
   - 複製您的後端網址（格式：`https://your-app-name.onrender.com`）

### 步驟二：修改前端連線設定

打開 `game.js`，找到 `connectSocket()` 方法（約第 487 行），將：

```javascript
const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
```

改為：

```javascript
const socketUrl = 'https://your-app-name.onrender.com'; // 替換成您的 Render 後端網址
```

**重要**：請將 `your-app-name.onrender.com` 替換成您在步驟一獲得的實際 Render 網址。

### 步驟三：部署前端到 GitHub Pages

1. **上傳檔案到 GitHub**
   - 建立新的 GitHub repository
   - 上傳修改後的 `index.html`、`styles.css`、`game.js`

2. **啟用 GitHub Pages**
   - 進入 repository 設定
   - 找到「Pages」選項
   - Source 選擇「Deploy from a branch」
   - Branch 選擇「main」或「master」
   - 點選「Save」

3. **取得前端網址**
   - 等待部署完成（約 1 分鐘）
   - 網址格式：`https://your-username.github.io/repository-name/`

## ✅ 測試部署

1. 開啟前端網址
2. 點選「對戰模式」→「開啟對戰」
3. 輸入玩家名稱並開始
4. 如果顯示房間代碼（6 位數字母），表示連線成功！
5. 用另一個裝置/瀏覽器加入房間測試多人對戰

## 🔧 本地測試

在部署前，建議先在本地測試：

```bash
# 啟動後端（終端機 1）
cd tetris-battle
npm install
node server.js

# 啟動前端（終端機 2）
cd tetris-battle
python3 -m http.server 8000

# 開啟瀏覽器訪問 http://localhost:8000
```

## 📝 後續調整

每次修改遊戲後：
1. 如果修改前端（index.html、styles.css、game.js），重新上傳到 GitHub，Pages 會自動更新
2. 如果修改後端（server.js），Push 到 GitHub 後，Render 會自動重新部署

## 🐛 常見問題

**Q: 前端顯示「等待中...」無法取得房間代碼**
A: 檢查 game.js 中的後端網址是否正確，且 Render 服務是否正常運行

**Q: Render 免費方案有限制嗎？**
A: 免費方案閒置 15 分鐘後會自動休眠，首次連線需等待約 30 秒喚醒

**Q: 如何查看後端錯誤訊息？**
A: 在 Render Dashboard 中點選您的服務，查看「Logs」標籤

## 📞 需要協助

如有任何部署問題，請隨時詢問！
