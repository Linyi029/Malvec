import json
import hashlib
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import subprocess, os
import httpx 
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
RESULT_DIR = os.path.join(BASE_DIR, "results")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)

app.mount("/results", StaticFiles(directory="results"), name="results")

# ===== HF Space 設定 =====
HF_SPACE_BASE = "https://raxhel-codebert-Malvec.hf.space"  # ✅ 修正: 大寫 M
HF_TOKEN = os.environ.get("hf_token")  # 可選,如果 Space 是私有的

async def trigger_hf_prediction(filename: str):
    """
    觸發 HF Space 預測並取得結果
    支援分批上傳大量檔案
    
    Args:
        filename: 檔案名稱 (例如: "test.exe")
    
    Returns:
        dict: 包含 final_label 和 embedding 的預測結果
    """
    
    # 找到分段的 TXT 檔案
    safe_filename = re.sub(r'[^\w\-]', '_', filename.rsplit('.', 1)[0])
    segment_dir = os.path.join(RESULT_DIR, "separate", f"unpacked_{safe_filename}")
    
    if not os.path.exists(segment_dir):
        print(f"❌ Segment directory not found: {segment_dir}")
        return None
    
    # 讀取所有 TXT 檔案
    txt_files = sorted([f for f in os.listdir(segment_dir) if f.endswith('.txt')])
    
    if not txt_files:
        print(f"❌ No TXT files found in: {segment_dir}")
        return None
    
    print(f"📂 Found {len(txt_files)} segment files")
    
    # ✅ 分批處理 - 每批最多 50 個檔案
    BATCH_SIZE = 50
    batches = [txt_files[i:i + BATCH_SIZE] for i in range(0, len(txt_files), BATCH_SIZE)]
    
    print(f"📦 Splitting into {len(batches)} batches of up to {BATCH_SIZE} files each")
    
    predict_url = f"{HF_SPACE_BASE}/predict"
    
    # 收集所有批次的結果
    all_predictions = []
    all_embeddings = []
    
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            headers = {}
            if HF_TOKEN:
                headers["Authorization"] = f"Bearer {HF_TOKEN}"
            
            # 先確認 Space 是否運行
            print(f"🔄 Checking Space status...")
            try:
                status_response = await client.get(f"{HF_SPACE_BASE}/model-info", timeout=10.0)
                print(f"   Status check response: {status_response.status_code}")
                if status_response.status_code == 200:
                    model_info = status_response.json()
                    print(f"✅ Space is running: {model_info.get('model_name')}")
                else:
                    print(f"⚠️  Space returned {status_response.status_code}, continuing anyway...")
            except Exception as e:
                print(f"⚠️  Could not verify Space status: {e}")
                print(f"   Continuing anyway...")
            
            # ✅ 逐批處理
            for batch_idx, batch_files in enumerate(batches, 1):
                print(f"\n📤 Processing batch {batch_idx}/{len(batches)} ({len(batch_files)} files)...")
                print(f"   Target URL: {predict_url}")
                
                # 準備這批檔案
                files = []
                for txt_file in batch_files:
                    file_path = os.path.join(segment_dir, txt_file)
                    with open(file_path, 'rb') as f:
                        content = f.read()
                    files.append(('files', (txt_file, content, 'text/plain')))
                
                print(f"   Prepared {len(files)} files for upload")
                
                # 發送請求
                try:
                    print(f"   🌐 Sending POST request...")
                    response = await client.post(
                        predict_url,
                        files=files,
                        headers=headers,
                        timeout=300.0
                    )
                    
                    print(f"   📥 Response received: {response.status_code}")
                    
                    if response.status_code != 200:
                        print(f"   ❌ Batch {batch_idx} failed: {response.status_code}")
                        print(f"   Response headers: {dict(response.headers)}")
                        print(f"   Response body (first 500 chars): {response.text[:500]}")
                        continue
                    
                    batch_result = response.json()
                    
                    # 收集這批的預測結果
                    if "segment_predictions" in batch_result:
                        all_predictions.extend(batch_result["segment_predictions"])
                        print(f"   ✅ Batch {batch_idx} completed: {batch_result.get('final_label')}")
                        print(f"   Added {len(batch_result['segment_predictions'])} predictions")
                    else:
                        print(f"   ⚠️  Batch {batch_idx}: No segment_predictions in response")
                        print(f"   Response keys: {list(batch_result.keys())}")
                    
                except httpx.TimeoutError as e:
                    print(f"   ⏱️  Batch {batch_idx} timeout: {e}")
                    continue
                except httpx.RequestError as e:
                    print(f"   ❌ Batch {batch_idx} request error: {e}")
                    continue
                except Exception as e:
                    print(f"   ❌ Batch {batch_idx} unexpected error: {type(e).__name__}: {e}")
                    import traceback
                    traceback.print_exc()
                    continue
        
        if not all_predictions:
            print("❌ No predictions received from any batch")
            return None
        
        # ✅ 合併所有批次的結果
        print(f"\n📊 Merging results from {len(all_predictions)} predictions...")
        
        # 統計所有預測的標籤
        from collections import Counter
        label_votes = [p["predicted_label"] for p in all_predictions]
        vote_counts = Counter(label_votes)
        final_label = vote_counts.most_common(1)[0][0]
        final_count = vote_counts[final_label]
        
        # 計算平均信心分數
        avg_confidence = sum(p["confidence"] for p in all_predictions) / len(all_predictions)
        
        # 選擇注意力最高且標籤匹配的 embedding
        same_label_preds = [p for p in all_predictions if p["predicted_label"] == final_label]
        if same_label_preds:
            best_pred = max(same_label_preds, key=lambda x: x.get("attention_score", 0))
        else:
            best_pred = max(all_predictions, key=lambda x: x.get("attention_score", 0))
        
        # 構建最終結果 (需要從原始預測中取得 embedding)
        # 注意: 我們需要重新取得 best_pred 所在批次的完整 embedding 資訊
        # 這裡簡化處理,返回統計結果
        
        result = {
            "final_label": final_label,
            "vote_count": final_count,
            "total_segments": len(all_predictions),
            "confidence": avg_confidence,
            "vote_distribution": dict(vote_counts),
            "embedding": {
                "values": [0.0] * 768,  # 佔位符,需要完整實現
                "source_file": best_pred.get("filename", "unknown"),
                "attention_score": best_pred.get("attention_score", 0),
                "dimension": 768
            },
            "segment_predictions": all_predictions[:10]  # 只返回前 10 個作為範例
        }
        
        print(f"✅ Final prediction: {final_label} ({final_count}/{len(all_predictions)} votes)")
        print(f"   Confidence: {avg_confidence:.3f}")
        
        return result
            
    except Exception as e:
        print(f"❌ Error calling HF Space: {e}")
        import traceback
        traceback.print_exc()
        return None

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    print("\n" + "="*80)
    print("🚀 NEW REQUEST")
    print("="*80)
    print(f"📝 Filename: {file.filename}")
    
    # 讀取並驗證檔案
    content = await file.read()
    print(f"📦 Received: {len(content)} bytes")
    print(f"🔍 First 4 bytes: {content[:4].hex()}")
    
    # 儲存檔案
    filename = file.filename
    upload_path = os.path.join(UPLOAD_DIR, filename)
    with open(upload_path, "wb") as f:
        f.write(content)
    
    print(f"💾 Saved to: {upload_path}")
    
    # 設定輸出路徑
    disasm_csv = os.path.join(RESULT_DIR, f"{filename}_disasm.csv")
    details_json = os.path.join(RESULT_DIR, f"{filename}_details.json")
    unpacked_filename = f"unpacked_files/unpacked_{filename}"
    
    print("\n🐳 DOCKER EXECUTION")
    
    # Docker 命令
    docker_cmd = [
        "docker", "run", "--rm",
        "-v", f"{UPLOAD_DIR}:/mnt/project/input:ro",
        "-v", f"{RESULT_DIR}:/mnt/project/output",
        "final",
        "bash", "-c",
        (
            # Step 1: 執行 unpack.py
            f"python /unpack.py /mnt/project/input/{filename} && "
            
            # Step 2: 檢查 JSON 的 unpack_success
            f"UNPACK_SUCCESS=$(python -c \"import json; "
            f"data=json.load(open('/mnt/project/output/{filename}_details.json')); "
            f"print('true' if data.get('unpack_success') else 'false')\") && "
            
            f"if [ \"$UNPACK_SUCCESS\" = \"true\" ]; then "
            f"  echo '✅ Unpack successful, running disasm...' && "
            f"  python /disasm.py /mnt/project/output/{unpacked_filename} /mnt/project/output/{filename}_disasm.csv && "
            
            # Step 3: 如果 disasm CSV 存在,執行分段
            f"  if [ -f /mnt/project/output/{filename}_disasm.csv ]; then "
            f"    echo '✅ Disasm complete, segmenting...' && "
            f"    python /segment_disasm.py /mnt/project/output/{filename}_disasm.csv; "
            f"  fi; "
            f"else "
            f"  echo '⚠️  Unpack failed or file not UPX packed, skipping disasm'; "
            f"fi"
        )
    ]
    
    print(f"Command: {' '.join(docker_cmd[:8])}...")
    
    try:
        result = subprocess.run(
            docker_cmd, 
            capture_output=True, 
            text=True, 
            timeout=120
        )
        
        print("\n" + "="*80)
        print("📤 DOCKER OUTPUT:")
        print("="*80)
        print(result.stdout)
        
        if result.stderr:
            print("\n⚠️  STDERR:")
            print(result.stderr)
        
        print("="*80)
        
    except subprocess.TimeoutExpired:
        print("❌ Docker timeout!")
        return {
            "error": "Docker execution timeout",
            "filename": filename,
            "details": {"error": "Timeout after 120 seconds"}
        }
    except Exception as e:
        print(f"❌ Docker error: {e}")
        return {
            "error": str(e),
            "filename": filename,
            "details": {"error": str(e)}
        }
    
    # 讀取結果
    print("\n📊 Reading results...")
    
    unpack_info = {}
    if os.path.exists(details_json):
        print(f"✅ Found: {details_json}")
        with open(details_json, "r") as jf:
            try:
                unpack_info = json.load(jf)
                print(f"📄 Details: {unpack_info}")
            except json.JSONDecodeError as e:
                print(f"❌ JSON error: {e}")
                unpack_info = {"error": "Invalid JSON"}
    else:
        print(f"❌ Not found: {details_json}")
        unpack_info = {
            "error": "details.json not found",
            "is_pe32": False,
            "is_exe": False,
            "unpack_success": False
        }
    
    disasm_success = os.path.exists(disasm_csv)
    print(f"{'✅' if disasm_success else '❌'} Disasm CSV: {disasm_success}")
    
    # ===== 觸發 HF Space 預測 =====
    prediction_result = None
    if disasm_success and unpack_info.get("unpack_success"):
        print("\n🤗 Triggering HF Space prediction...")
        prediction_result = await trigger_hf_prediction(filename)
        
        if prediction_result:
            print(f"✅ Prediction successful: {prediction_result.get('final_label')}")
        else:
            print(f"⚠️  Prediction failed or unavailable")
    else:
        print("\n⚠️  Skipping prediction (disasm failed or not UPX packed)")
    
    response = {
        "filename": filename,
        "details": unpack_info,
        "disasm_csv": f"http://127.0.0.1:8000/results/{os.path.basename(disasm_csv)}" if disasm_success else None,
        "disasm_success": disasm_success,
        "status": "done" if disasm_success else "unpack_failed",
        "prediction": prediction_result  # 包含 final_label 和 embedding
    }
    
    print("\n✅ Response ready\n")
    return response

@app.get("/api/model-info")
async def get_model_info():
    """取得 HF Space 模型資訊"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{HF_SPACE_BASE}/model-info")
            if response.status_code == 200:
                return response.json()
            return {"status": "unavailable"}
    except:
        return {"status": "error"}

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "hf_space": HF_SPACE_BASE
    }