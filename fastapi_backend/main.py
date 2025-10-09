from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import subprocess, os, uuid

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

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    # 1️⃣ 儲存上傳檔案
    file_id = str(uuid.uuid4())[:8]
    filename = f"{file_id}_{file.filename}"
    upload_path = os.path.join(UPLOAD_DIR, filename)
    with open(upload_path, "wb") as f:
        f.write(await file.read())

    # 2️⃣ 呼叫 Docker 分析
    output_csv = os.path.join(RESULT_DIR, f"{filename}.csv")
    docker_cmd = [
        "docker", "run", "--rm",
        "-v", f"{UPLOAD_DIR}:/mnt/project/input",
        "-v", f"{RESULT_DIR}:/mnt/project/output",
        "final",  # 妳的分析 image 名稱
        "python", "analyze_pe.py",
        f"/mnt/project/input/{filename}",
        f"/mnt/project/output/{filename}.csv",
    ]
    result = subprocess.run(docker_cmd, capture_output=True, text=True)

    # 3️⃣ 回傳分析結果
    return {
        "filename": filename,
        "status": "done" if result.returncode == 0 else "error",
        "csv_path": output_csv,
        "stdout": result.stdout[-300:],  # 最後 300 行輸出
        "stderr": result.stderr[-300:],
    }
