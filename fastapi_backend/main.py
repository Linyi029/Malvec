import json
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

app.mount("/results", StaticFiles(directory="results"), name="results")

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    filename = file.filename
    upload_path = os.path.join(UPLOAD_DIR, filename)
    with open(upload_path, "wb") as f:
        f.write(await file.read())

    disasm_csv = os.path.join(RESULT_DIR, f"{filename}_disasm.csv")
    details_json = os.path.join(RESULT_DIR, f"{filename}_details.json")
    unpacked_path = f"/mnt/project/output/unpacked_files/unpacked_{filename}"

    

    docker_cmd = [
    "docker", "run", "--rm",
    "-v", f"{UPLOAD_DIR}:/mnt/project/input",
    "-v", f"{RESULT_DIR}:/mnt/project/output",
    "final",
    "bash", "-c",
    (
        f"python unpack.py /mnt/project/input/{filename} && "
        f"if [ -f {unpacked_path} ]; then "
        f"python disasm.py {unpacked_path} /mnt/project/output/{filename}_disasm.csv; "
        f"else echo '❌ Unpack failed, skipping disasm'; fi"
    )
    ]

    result = subprocess.run(docker_cmd, capture_output=True, text=True)

    # print 出 docker log 方便 debug
    print("=== [Docker STDOUT] ===")
    print(result.stdout)
    print("=== [Docker STDERR] ===")
    print(result.stderr)

    # 嘗試安全讀取 JSON
    unpack_info = {}
    if os.path.exists(details_json):
        with open(details_json, "r") as jf:
            content = jf.read().strip()
            if content:
                try:
                    unpack_info = json.loads(content)
                except json.JSONDecodeError:
                    unpack_info = {"error": "Invalid JSON format", "raw": content}
            else:
                unpack_info = {"error": "Empty JSON file"}
    else:
        unpack_info = {"error": "details.json not found"}

    disasm_success = os.path.exists(disasm_csv)

    return {
        "filename": filename,
        "details": unpack_info,
        "disasm_csv": f"http://127.0.0.1:8000/results/{os.path.basename(disasm_csv)}" if disasm_success else None,
        "disasm_success": disasm_success,
        "status": "done" if disasm_success else "unpack_failed",
        "stdout": result.stdout[-500:],
        "stderr": result.stderr[-200:]
    }
