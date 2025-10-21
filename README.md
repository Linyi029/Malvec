
---

# 🧠 Malvec / CodeBERT_Malvec — Admin 操作教學

這份文件是給 **團隊共用 Hugging Face Space 的管理者（Admin）** 使用的，教你如何在 Hugging Face 上部署、維護與更新 **Malvec** 專案的 FastAPI 後端。

---

## 🚀 專案簡介

此 Space（`malvec/codebert_Malvec`）提供一個基於 **FastAPI + CodeBERT 模型** 的 API 服務，用於：

* 對惡意程式的組語（disassembly）進行家族分類；
* 回傳分類標籤與置信度；
* 未來可擴展至 attention heatmap、SOM 聚類等可視化分析。

---

## 🧩 1. 環境與前置條件

### 1.1 你需要

* 一個 Hugging Face 帳號，且被加入為該 Space 的 **admin 或 write 權限成員**。
  Space 頁面：[https://huggingface.co/spaces/malvec/codebert_Malvec](https://huggingface.co/spaces/malvec/codebert_Malvec)
* 本地電腦（macOS/Linux/Windows）可使用 git、Python 3.9+。
* Hugging Face CLI 工具。

---

## 🔐 2. 登入 Hugging Face 並設定 Access Token

### 2.1 產生 Token

1. 登入 Hugging Face → 點右上角頭像 → **Settings → Access Tokens**
2. 點「**New token**」，權限選：

   * **Write**（建議，推送更新需要）
3. 複製 Token（形如 `hf_XXXXXXXXXXXXXXXX`）

---

### 2.2 本地登入

```bash
pip install -U huggingface_hub
huggingface-cli login
# 貼上 hf_token
```

登入後可驗證：

```bash
huggingface-cli whoami
```

顯示：

```
You are logged in as raxhel
```

---

## 🧰 3. Clone 共用 Space 專案

第一次操作時：

```bash
git clone https://huggingface.co/spaces/malvec/codebert_Malvec
cd codebert_Malvec
```

之後更新時只需：

```bash
git pull
```

---

## 🧱 4. 專案結構說明

```
codebert_Malvec/
├── app.py / main.py           # FastAPI 主程式
├── requirements.txt           # 套件需求清單
├── Dockerfile                 # Space 啟動設定
├── README.md                  # 本文件
└── (模型相關檔不應放此 Space)
```

> 🧩 模型請放在 Hugging Face **Model Repo**（例如 `malvec/Malvec_predict`），
> Space 只需在程式內使用 `from_pretrained("malvec/Malvec_predict")` 載入。

---

## 🌐 5. 推送更新到 Space

### 新增或修改程式

修改 `app.py` / `requirements.txt` / `Dockerfile` 後，執行：

```bash
git add .
git commit -m "update app logic or dependencies"
git push
```

Hugging Face 會自動：

* 重新 build Docker image；
* 自動啟動服務；
* 顯示 “Running on: [https://malvec-codebert_Malvec.hf.space”。](https://malvec-codebert_Malvec.hf.space”。)

---

