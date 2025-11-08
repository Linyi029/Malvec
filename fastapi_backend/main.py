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
HF_SPACE_BASE = "https://malvec-codebert-malvec.hf.space"
# 嘗試多種方式獲取 HF token
HF_TOKEN = None
try:
    # 方法 1: 從 huggingface_hub 讀取已登入的 token
    from huggingface_hub import get_token
    HF_TOKEN = get_token()
    if HF_TOKEN:
        print(f"HF Token loaded from huggingface_hub (length: {len(HF_TOKEN)})")
except Exception as e:
    print(f"Could not load token from huggingface_hub: {e}")


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
        print(f"Segment directory not found: {segment_dir}")
        return None
    
    # 讀取所有 TXT 檔案
    txt_files = sorted([f for f in os.listdir(segment_dir) if f.endswith('.txt')])
    
    if not txt_files:
        print(f"No TXT files found in: {segment_dir}")
        return None
    
    print(f"Found {len(txt_files)} segment files")
    
    # 一次上傳所有檔案
    predict_url = f"{HF_SPACE_BASE}/predict"
    
    try:
        # 準備所有檔案
        files = []
        for txt_file in txt_files:
            file_path = os.path.join(segment_dir, txt_file)
            with open(file_path, 'rb') as f:
                content = f.read()
            files.append(('files', (txt_file, content, 'text/plain')))
        
        print(f"Uploading {len(files)} files to HF Space...")
        
        async with httpx.AsyncClient(timeout=600.0) as client:
            headers = {}
            if HF_TOKEN:
                headers["Authorization"] = f"Bearer {HF_TOKEN}"
            
            # 發送預測請求
            print(f"Sending to: {predict_url}")
            
            response = await client.post(
                predict_url,
                files=files,
                headers=headers,
                timeout=600.0
            )
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"HF Space error: {response.status_code}")
                print(f"   Response: {response.text[:500]}")
                return None
            
            result = response.json()
            
            # 驗證返回的結果包含所需的欄位
            print(f"Prediction received!")
            print(f"   Final label: {result.get('final_label')}")
            print(f"   Confidence: {result.get('confidence', 0):.3f}")
            print(f"   Total segments: {result.get('total_segments', 0)}")
            print(f"   Embedding dimension: {result.get('embedding', {}).get('dimension', 0)}")
            print(f"   Embedding source: {result.get('embedding', {}).get('source_file', 'N/A')}")
            print(f"   Attention score: {result.get('embedding', {}).get('attention_score', 0):.4f}")
            
            # 新增：檢查 embedding.values 是否存在
            if 'embedding' in result and 'values' in result['embedding']:
                embedding_values = result['embedding']['values']
                print(f"   Embedding values found: {len(embedding_values)} dimensions")
                print(f"   First 5 values: {embedding_values[:5]}")
            else:
                print(f"   WARNING: No embedding.values found in response!")
                print(f"   Response keys: {result.keys()}")
                if 'embedding' in result:
                    print(f"   Embedding keys: {result['embedding'].keys()}")
            
            return result
            
    except Exception as e:
        print(f"Error calling HF Space: {e}")
        import traceback
        traceback.print_exc()
        return None
    

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    print("\n" + "="*80)
    print(" NEW REQUEST")
    print("="*80)
    print(f"Filename: {file.filename}")
    
    # 讀取並驗證檔案
    content = await file.read()
    print(f"Received: {len(content)} bytes")
    print(f"First 4 bytes: {content[:4].hex()}")
    
    # 儲存檔案
    filename = file.filename
    upload_path = os.path.join(UPLOAD_DIR, filename)
    with open(upload_path, "wb") as f:
        f.write(content)
    
    print(f"Saved to: {upload_path}")
    
    # 設定輸出路徑
    disasm_csv = os.path.join(RESULT_DIR, f"{filename}_disasm.csv")
    details_json = os.path.join(RESULT_DIR, f"{filename}_details.json")
    unpacked_filename = f"unpacked_files/unpacked_{filename}"
    
    print("\n DOCKER EXECUTION")
    
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
            f"  echo 'Unpack successful, running disasm...' && "
            f"  python /disasm.py /mnt/project/output/{unpacked_filename} /mnt/project/output/{filename}_disasm.csv && "
            
            # Step 3: 如果 disasm CSV 存在,執行分段
            f"  if [ -f /mnt/project/output/{filename}_disasm.csv ]; then "
            f"    echo 'Disasm complete, segmenting...' && "
            f"    python /segment_disasm.py /mnt/project/output/{filename}_disasm.csv; "
            f"  fi; "
            f"else "
            f"  echo 'Unpack failed or file not UPX packed, skipping disasm'; "
            f"fi"
        )
    ]
    
    print(f"Command: {' '.join(docker_cmd[:8])}...")
    
    try:
        # 
        result = subprocess.run(
            docker_cmd, 
            capture_output=True, 
            text=True, 
            timeout=600 # 
        )
        
        print("\n" + "="*80)
        print("DOCKER OUTPUT:")
        print("="*80)
        print(result.stdout)
        
        if result.stderr:
            print("\n  STDERR:")
            print(result.stderr)
        
        print("="*80)
        
    except subprocess.TimeoutExpired:
        print(" Docker timeout!")
        return {
            "error": "Docker execution timeout",
            "filename": filename,
            "details": {"error": "Timeout after 600 seconds"}
        }
    except Exception as e:
        print(f" Docker error: {e}")
        return {
            "error": str(e),
            "filename": filename,
            "details": {"error": str(e)}
        }
    
    # 讀取結果
    print("\n Reading results...")
    
    unpack_info = {}
    if os.path.exists(details_json):
        print(f" Found: {details_json}")
        with open(details_json, "r") as jf:
            try:
                unpack_info = json.load(jf)
                print(f" Details: {unpack_info}")
            except json.JSONDecodeError as e:
                print(f" JSON error: {e}")
                unpack_info = {"error": "Invalid JSON"}
    else:
        print(f" Not found: {details_json}")
        unpack_info = {
            "error": "details.json not found",
            "is_pe32": False,
            "is_exe": False,
            "unpack_success": False
        }
    
    disasm_success = os.path.exists(disasm_csv)
    print(f"{'✅' if disasm_success else '❌'} Disasm CSV: {disasm_success}")
    
    # ===== 觸發 HF Space 預測 (包含 SOM) =====
    prediction_result = None
    som_analysis = None # 

    if disasm_success and unpack_info.get("unpack_success"):
        print("\n Triggering HF Space prediction (incl. SOM)...")
        prediction_result = await trigger_hf_prediction(filename)
        
        if prediction_result:
            print(f" Prediction successful: {prediction_result.get('final_label')}")
            
            # 
            # HF Space 
            som_analysis = prediction_result.get("som_analysis") 
            
            if som_analysis:
                print(f"✅ SOM analysis received from HF Space!")
                # 
                position = som_analysis.get('winner_position', {})
                print(f"   Position: ({position.get('row', 'N/A')}, {position.get('col', 'N/A')})")
            else:
                print("⚠️  SOM analysis *not* found in HF Space response.")
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
        "prediction": prediction_result,  # 
        "som_analysis": som_analysis, # 
    }
    
    #  最終檢查：確認 response 中包含 embedding
    print("\n🔍 Final response check:")
    if response.get('prediction') and response['prediction'].get('embedding'):
        if 'values' in response['prediction']['embedding']:
            print(f" Response contains embedding with {len(response['prediction']['embedding']['values'])} values")
        else:
            print(f" Response embedding missing 'values' key!")
    else:
        print(f" Response missing prediction.embedding!")
    
   # ✅ 檢查 SOM 分析結果
    if response.get('som_analysis'):
        print(f"✅ Response contains SOM analysis")
        print(f"   Winner position: {response['som_analysis']['winner_position']}")
        print(f"   Features: {response['som_analysis']['features']}")
    else:
        print(f"⚠️  No SOM analysis in response")
    
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