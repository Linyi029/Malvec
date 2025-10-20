import pefile
import os
import sys
import subprocess
import json

def unpack_if_upx(filepath, output_base):
    """嘗試解壓縮，統一輸出到 /mnt/project/output/unpacked_files"""
    unpack_dir = os.path.join(output_base, "unpacked_files")
    os.makedirs(unpack_dir, exist_ok=True)

    unpacked_path = os.path.join(unpack_dir, f"unpacked_{os.path.basename(filepath)}")
    try:
        result = subprocess.run(
            ["upx", "-d", filepath, "-o", unpacked_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        if result.returncode == 0 and os.path.exists(unpacked_path):
            return unpacked_path
        else:
            print(f"[!] UPX failed: {result.stderr}")
    except Exception as e:
        print(f"[!] UPX error: {e}")
    return None

def analyze_pe(filepath):
    try:
        pe = pefile.PE(filepath)
        return {
            "is_exe": pe.is_exe(),
            "is_pe32": hex(pe.FILE_HEADER.Machine) == "0x14c"
        }
    except Exception as e:
        print(f"[!] PE parse error: {e}")
        return {"is_exe": False, "is_pe32": False}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python unpack.py <input_file>"}))
        sys.exit(1)

    input_path = sys.argv[1]
    output_base = "/mnt/project/output"

    info = {
        "filename": os.path.basename(input_path),
        "unpack_success": False,
        "is_exe": False,
        "is_pe32": False,
        "unpacked_path": None
    }

    # 分析 PE 基本資訊
    pe_info = analyze_pe(input_path)
    info.update(pe_info)

    # 嘗試解壓
    unpacked = unpack_if_upx(input_path, output_base)
    if unpacked:
        info["unpack_success"] = True
        info["unpacked_path"] = unpacked

    # 統一輸出 JSON
    details_path = os.path.join(output_base, f"{info['filename']}_details.json")
    with open(details_path, "w") as f:
        json.dump(info, f, indent=2)

    print(json.dumps(info))


