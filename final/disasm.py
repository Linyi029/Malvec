import pefile
import capstone
import os
import csv
import sys

def disasm_text_section(filepath):
    try:
        pe = pefile.PE(filepath)
        if not pe.is_exe():
            return None

        text_section = None
        for section in pe.sections:
            name = section.Name.rstrip(b'\x00').decode(errors='ignore')
            if name == '.text':
                text_section = section
                break

        if not text_section:
            return None

        code = text_section.get_data()
        addr = pe.OPTIONAL_HEADER.ImageBase + text_section.VirtualAddress
        mode = capstone.CS_MODE_32 if pe.FILE_HEADER.Machine == 0x14c else capstone.CS_MODE_64
        cs = capstone.Cs(capstone.CS_ARCH_X86, mode)
        cs.detail = False

        disasm = []
        for insn in cs.disasm(code, addr):
            if insn.op_str:
                mnemonic = insn.mnemonic
                op_str = insn.op_str.replace('[', '').replace(']', '').replace('0x', 'hex')
                op_str = op_str.replace(',', '')
                disasm.append(f"{mnemonic} {op_str}")
            else:
                disasm.append(insn.mnemonic)

        if not disasm:
            return None

        return disasm

    except Exception as e:
        print(f"[!] Failed to disasm {filepath}: {e}")
        return None


def process_file(filepath, writer, stats):
    disassembly = disasm_text_section(filepath)
    if disassembly:
        filename = os.path.basename(filepath)
        writer.writerow([filename, " </s> ".join(disassembly) + " </s>"])
        stats['written'] += 1
    else:
        print(f"[!] Skipped {filepath}: no .text section or empty disassembly")
        stats['skipped'] += 1


def process_input(input_path, output_csv):
    stats = {'written': 0, 'skipped': 0}

    with open(output_csv, "w", newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["filename", "disassembly"])

        if os.path.isfile(input_path):
            process_file(input_path, writer, stats)
        else:
            for root, _, files in os.walk(input_path):
                for file in files:
                    full_path = os.path.join(root, file)
                    process_file(full_path, writer, stats)

    print(f"\n✅ Finished processing '{input_path}'")
    print(f"   Total files written to CSV: {stats['written']}")
    print(f"   Total files skipped: {stats['skipped']}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python disasm.py <input_file_or_directory> <output_csv>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_csv = sys.argv[2]

    process_input(input_path, output_csv)
