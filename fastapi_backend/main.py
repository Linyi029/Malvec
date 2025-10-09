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
    filename = f"{file.filename}"
    upload_path = os.path.join(UPLOAD_DIR, filename)
    with open(upload_path, "wb") as f:
        f.write(await file.read())

    # 2️⃣ Docker：同一個 container 連續跑 unpack → disasm
    details = f"/mnt/project/output/{filename}_details.csv"
    disasm_csv = f"/mnt/project/output/{filename}_disasm.csv"

    docker_cmd = [
        "docker", "run", "--rm",
        "-v", f"{UPLOAD_DIR}:/mnt/project/input",
        "-v", f"{RESULT_DIR}:/mnt/project/output",
        "final",  # 你的分析 image 名稱
        "bash", "-c",
        (
            f"python unpack.py /mnt/project/input/{filename} {details} && "
            f"if [ -f {details} ]; then "
            f"python disasm.py /mnt/project/output/unpacked_files/unpacked_{filename} {disasm_csv}; "
            f"else echo '❌ Unpack failed, skipping disasm'; fi"
        )
    ]

    result = subprocess.run(docker_cmd, capture_output=True, text=True)

    # 3️⃣ 確認分析結果
    output_csv = os.path.join(RESULT_DIR, f"{filename}_disasm.csv")
    #unpack_success = os.path.exists(os.path.join(RESULT_DIR, f"{filename}_unpacked.exe"))
    disasm_success = os.path.exists(output_csv)

    # 4️⃣ 回傳分析結果
    return {
        "filename": filename,
        #"unpack_success": unpack_success,
        "disasm_success": disasm_success,
        "csv_path": output_csv if disasm_success else None,
        "status": "done" if disasm_success else "unpack_failed",
        "stdout": result.stdout[-300:],  # 最後 300 行輸出
        "stderr": result.stderr[-300:],
    }
