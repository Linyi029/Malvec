import pefile
import os
import json
import sys
import hashlib
import subprocess

def get_hashes(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()
    return {
        "md5": hashlib.md5(data).hexdigest(),
        "sha1": hashlib.sha1(data).hexdigest(),
        "sha256": hashlib.sha256(data).hexdigest()
    }

def extract_signature_info(filepath):
    try:
        result = subprocess.run(["osslsigncode", "verify", filepath],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if "No signature found" in result.stdout or "No signature found" in result.stderr:
            return {"signed": False, "status": "No signature found"}
        elif "Verification: ok" in result.stdout:
            return {"signed": True, "status": "Valid"}
        else:
            return {"signed": True, "status": "Invalid or Unverified"}
    except Exception as e:
        return {"signed": False, "status": f"Error: {e}"}

def extract_signature_raw(filepath):
    try:
        tmp_output = os.path.join("/tmp", f"{os.path.basename(filepath)}.sig")
        result = subprocess.run(["osslsigncode", "extract-signature", "-in", filepath, "-out", tmp_output],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if os.path.exists(tmp_output):
            with open(tmp_output, "rb") as f:
                content = f.read(200)
            os.remove(tmp_output)
            return content.hex()
        return f"[extract-signature] {result.stdout.strip() or result.stderr.strip()}"
    except Exception as e:
        return f"Error extracting signature: {e}"

def unpack_if_upx(filepath, unpack_dir):
    """嘗試用 UPX 解壓,返回解壓後的路徑或 None"""
    try:
        result = subprocess.run(["upx", "-t", filepath],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0:
            unpacked_path = os.path.join(unpack_dir, f"unpacked_{os.path.basename(filepath)}")
            unpack_result = subprocess.run(["upx", "-d", filepath, "-o", unpacked_path],
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if unpack_result.returncode == 0 and os.path.exists(unpacked_path):
                return unpacked_path
    except:
        pass
    return None

def analyze_pe(filepath):
    """分析 PE 檔案基本資訊"""
    pe = pefile.PE(filepath)
    info = {
        "filename": os.path.basename(filepath),
        "hashes": get_hashes(filepath),
        "machine": hex(pe.FILE_HEADER.Machine),
        "entry_point": hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint),
        "is_exe": pe.is_exe(),
        "is_dll": pe.is_dll(),
        "is_driver": pe.is_driver(),
        "sections": [],
        "imported_dlls": [],
        "imported_functions": [],
    }

    for section in pe.sections:
        info["sections"].append(section.Name.decode(errors='ignore').strip('\x00'))

    if hasattr(pe, 'DIRECTORY_ENTRY_IMPORT'):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            dll = entry.dll.decode()
            info["imported_dlls"].append(dll)
            for imp in entry.imports:
                name = imp.name.decode() if imp.name else "None"
                info["imported_functions"].append(name)

    return info

def process_single_file(filepath, output_dir):
    """
    處理單個檔案並產生 JSON 報告
    返回: (success: bool, details: dict)
    """
    details = {
        "filename": os.path.basename(filepath),
        "is_pe32": False,
        "is_exe": False,
        "unpack_success": False,
        "unpacked_path": None,
        "error": None
    }
    
    try:
        # 檢查 MZ header
        with open(filepath, 'rb') as f:
            if f.read(2) != b'MZ':
                details["error"] = "Not a PE file (missing MZ header)"
                return False, details
        
        # 檢查 PE 格式
        try:
            pe = pefile.PE(filepath)
        except Exception as e:
            details["error"] = f"Invalid PE file: {e}"
            return False, details
        
        # 檢查是否為 PE32 (32-bit)
        details["is_pe32"] = (pe.FILE_HEADER.Machine == 0x14c)
        
        # 檢查是否為 EXE
        details["is_exe"] = pe.is_exe()
        
        if not details["is_exe"]:
            details["error"] = "Not an executable file"
            return False, details
        
        # 嘗試 UPX 解壓
        unpacked_dir = os.path.join(output_dir, "unpacked_files")
        os.makedirs(unpacked_dir, exist_ok=True)
        
        unpacked_path = unpack_if_upx(filepath, unpacked_dir)
        
        if unpacked_path and os.path.exists(unpacked_path):
            details["unpack_success"] = True
            details["unpacked_path"] = unpacked_path
            print(f"✅ Successfully unpacked: {unpacked_path}")
            return True, details
        else:
            details["error"] = "UPX unpack failed or file not UPX packed"
            print(f"⚠️  UPX unpack failed for {filepath}")
            return False, details
            
    except Exception as e:
        details["error"] = f"Processing error: {str(e)}"
        print(f"❌ Error processing {filepath}: {e}")
        return False, details

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python unpack.py <input_file>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    
    # 輸出目錄是 input 的父目錄的 output
    # Docker 中: /mnt/project/input/file.exe -> output 到 /mnt/project/output/
    input_dir = os.path.dirname(input_path)
    output_dir = input_dir.replace("/input", "/output")
    
    if not os.path.exists(output_dir):
        output_dir = os.path.join(os.getcwd(), "output")
        os.makedirs(output_dir, exist_ok=True)
    
    print(f" Input: {input_path}")
    print(f"Output: {output_dir}")
    
    # 處理檔案
    success, details = process_single_file(input_path, output_dir)
    
    # 產生 JSON 報告
    filename = os.path.basename(input_path)
    json_output = os.path.join(output_dir, f"{filename}_details.json")
    
    with open(json_output, "w") as f:
        json.dump(details, f, indent=2)
    
    print(f"Details written to: {json_output}")
    
    if success:
        print("Processing completed successfully")
        sys.exit(0)
    else:
        print(f" Processing completed with issues: {details.get('error', 'Unknown error')}")
        sys.exit(0)  # 仍然返回 0,讓 FastAPI 可以讀取 JSON