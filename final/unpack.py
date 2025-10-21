import pefile
import os
import csv
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
    try:
        result = subprocess.run(["upx", "-t", filepath],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0:
            unpacked_path = os.path.join(unpack_dir, f"unpacked_{os.path.basename(filepath)}")
            subprocess.run(["upx", "-d", filepath, "-o", unpacked_path])
            return unpacked_path
    except:
        pass
    return None

def analyze_pe(filepath):
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

def process_file(full_path, writer, unpacked_dir):
    try:
        with open(full_path, 'rb') as fcheck:
            if fcheck.read(2) != b'MZ':
                return False

        pe = pefile.PE(full_path)
        if not pe.is_exe():
            return False

        unpacked = unpack_if_upx(full_path, unpacked_dir)
        if not unpacked or not os.path.exists(unpacked):
            return False  # 只處理成功解壓縮的

        sig_info = extract_signature_info(full_path)
        raw_sig = extract_signature_raw(full_path)

        result = analyze_pe(unpacked)
        result.update({
            "signed": sig_info["signed"],
            "signature_status": sig_info["status"],
            "osslsigncode_extract": raw_sig
        })

        writer.writerow({
            "filename": result["filename"],
            "md5": result["hashes"]["md5"],
            "sha1": result["hashes"]["sha1"],
            "sha256": result["hashes"]["sha256"],
            "entry_point": result["entry_point"],
            "machine": result["machine"],
            "is_exe": result["is_exe"],
            "is_dll": result["is_dll"],
            "is_driver": result["is_driver"],
            "sections": ";".join(result["sections"]),
            "imported_dlls": ";".join(result["imported_dlls"]),
            "imported_functions": ";".join(result["imported_functions"]),
            "signed": result["signed"],
            "signature_status": result["signature_status"],
            "osslsigncode_extract": result["osslsigncode_extract"]
        })
        return True

    except Exception as e:
        print(f"[!] Error processing {full_path}: {e}")
        return False

def process_input(input_path, output_csv):
    unpacked_dir = os.path.join(os.path.dirname(output_csv), "unpacked_files")
    os.makedirs(unpacked_dir, exist_ok=True)
    stats = {"written": 0, "skipped": 0}

    with open(output_csv, "w", newline='') as f:
        fieldnames = [
            "filename", "md5", "sha1", "sha256", "entry_point", "machine",
            "is_exe", "is_dll", "is_driver", "sections", "imported_dlls", "imported_functions",
            "signed", "signature_status", "osslsigncode_extract"
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        if os.path.isfile(input_path):
            if process_file(input_path, writer, unpacked_dir):
                stats["written"] += 1
            else:
                stats["skipped"] += 1
        else:
            for root, _, files in os.walk(input_path):
                for file in files:
                    full_path = os.path.join(root, file)
                    if process_file(full_path, writer, unpacked_dir):
                        stats["written"] += 1
                    else:
                        stats["skipped"] += 1

    print(f"\n✅ Total files written: {stats['written']}")
    print(f"⚠ Total files skipped: {stats['skipped']}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python analyze_pe.py <input_file_or_directory> <output_csv>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_csv = sys.argv[2]
    process_input(input_path, output_csv)
