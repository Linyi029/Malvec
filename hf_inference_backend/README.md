# Malvec Family Inference API (Hugging Face Docker Space)

這個 Space 提供惡意程式嵌入向量的「家族分類推論」與「可視化」服務。

## 主要端點
| Endpoint | 方法 | 功能 |
|-----------|------|------|
| `/predict/csv` | POST | 上傳 CSV 檔，回傳每列樣本的家族預測與機率 |
| `/plot/umap` | POST | 上傳 CSV 檔，輸出家族分佈的 UMAP 圖 (PNG) |
| `/health` | GET | 顯示目前模型資訊 |

## 部署步驟
1. 到 [Hugging Face Spaces](https://huggingface.co/spaces) 建立新 Space
   - 選擇 **Docker** 類型
   - 將本資料夾內容上傳或 push 至 Space
2. 在 **Settings → Variables & secrets** 中設定：
   - `MODEL_REPO_ID`: 你的模型 repo (例：`Linyi029/malware-family-model`)
   - `MODEL_FILENAME`: 權重檔案名稱
   - `FAMILY_LABELS`: 以逗號分隔的家族名稱清單
   - `INPUT_DIM`: 向量維度 (如 768 或 2048)
3. Space build 完成後會出現 API 網址，例如：
