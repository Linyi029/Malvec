# ⚙️ Development
## 1. 啟動後端（本地環境）
### （可選）建立並啟用 conda 環境
```
conda create -n pe-env python=3.10 -y
conda activate pe-env
```

💡 附註：
不一定需要使用 conda，也可使用 venv 或其他環境管理工具。

但在啟動 FastAPI 前，請務必確認目前所在的 Python 環境 已安裝專案相依套件。

### 安裝相依套件
```
pip install -r requirements.txt
```
### 啟動 FastAPI 伺服器
```
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
可以開http://localhost:8000/docs 這邊有可以互動的GUI做開發測試

## 2. 建立 Docker 分析容器（複製final檔案夾，然後在外面build）
### 建立 image
```
docker build -t final .
```
### 啟動分析容器並掛載資料夾
```
docker run -it --rm \
  -v "$(pwd)/uploads:/mnt/project/input" \
  -v "$(pwd)/results:/mnt/project/output" \
  -p 8000:8000 \
  final uvicorn main:app --host 0.0.0.0 --port 8000
```
## 3. 啟動前端
```
cd frontend
npm install
npm run dev
```

# 🧩 System Overview

## 🔹 Backend — FastAPI + Docker Pipeline

使用者上傳 .exe 檔案後，FastAPI 會自動執行完整分析流程：

* 呼叫 unpack.py 嘗試進行 UPX 解壓。若成功，會於 /mnt/project/output/unpacked_files/ 產生解壓後檔案，並且進行檢查（是exe、是pe32、是upx packed）
* 若是檢查通過，執行 disasm.py 進行反組譯，輸出對應的 .csv。

產生分析摘要 JSON：
```
{
  "filename": "sample.exe",
  "is_exe": true,
  "is_pe32": true,
  "unpack_success": true,
  "unpacked_path": "/mnt/project/output/unpacked_files/unpacked_sample.exe"
}
```

FastAPI 端會將結果統一存放於：
```
results/
├── sample.exe_details.json
└── sample.exe_disasm.csv
```

Docker 容器以 final image 為執行單位，掛載路徑如下：
```
-v fastapi_backend/uploads:/mnt/project/input
-v fastapi_backend/results:/mnt/project/output
```

## 🔹 Frontend — React + Tailwind Dashboard

前端提供可視化分析控制台，使用者可進行：

* 拖曳 / 批次上傳 .exe 檔案
* 即時觀察分析進度（顯示動畫：「Analyzing PE header… / Reading EXE… / Checking UPX…」）

完成分析後顯示檢查結果：

* PE 32-bit 檔案
* EXE 格式驗證
* UPX 解壓成功


若三項皆通過，該檔案會自動加入「模型待訓練資料」。

主要模組結構如下：
```
frontend/
├── hooks/
│   └── useFileProcessor.js      # 控制分析流程與 API 呼叫
├── pages/
│   └── Home.jsx                 # 主控制介面
└── components/
    ├── AnimatedBullets.jsx
    ├── CircleProgress.jsx
    └── TrainingModal.jsx
```
## 🧩 API Endpoints
```
*POST /api/analyze
```

上傳可執行檔並觸發完整分析流程。

Request 範例：
```
curl -X POST -F "file=@sample.exe" http://127.0.0.1:8000/api/analyze
```

Response 範例：
```
{
  "filename": "sample.exe",
  "details": {
    "is_exe": true,
    "is_pe32": true,
    "unpack_success": true,
    "unpacked_path": "/mnt/project/output/unpacked_files/unpacked_sample.exe"
  },
  "disasm_csv": "http://127.0.0.1:8000/results/sample.exe_disasm.csv",
  "disasm_success": true,
  "status": "done"
}
```

🧱 File Structure
```
fastapi_backend/
├── main.py                # FastAPI 主入口
├── uploads/               # 前端上傳檔案儲存位置
└── results/               # 分析結果（JSON / CSV）
    └──unpacked_files      # 解包完的檔案
```

# 🧩 Branch Info

* 新增 JSON 格式的 details 分析輸出
* 修正 FastAPI 結果傳遞邏輯
* 優化前端 useFileProcessor 控制流程
* 三項檢查通過才會出現在「模型待訓練資料」區

# 📊 TODO / Next Steps

* 將 disasm 結果自動串接至 CodeBERT 模型推論
* 加入訓練結果的可視化（SOM / attention heatmap）
* 提供模型版本控制（Model registry）
