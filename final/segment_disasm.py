import os
import sys
import csv
import re

# 增加 CSV 欄位大小限制
csv.field_size_limit(10**7)  # 設定為 10MB

# 參數設定
N = 60  # 每段指令數
TOKEN_LIMIT = 512  # 最大 token 數限制

def segment_disasm_csv(csv_path, output_base_dir="separate"):
    """
    讀取 disasm CSV 並將每個檔案的反組譯碼切段成多個 TXT
    
    Args:
        csv_path: disasm CSV 的完整路徑
        output_base_dir: 輸出根目錄名稱 (預設 "separate")
    """
    
    # 檢查 CSV 是否存在
    if not os.path.exists(csv_path):
        print(f"❌ CSV 不存在: {csv_path}")
        return False
    
    # 設定輸出目錄 (與 CSV 同層的 separate/)
    csv_dir = os.path.dirname(csv_path)
    output_dir = os.path.join(csv_dir, output_base_dir)
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"📂 開始分段處理: {os.path.basename(csv_path)}")
    print(f"📁 輸出目錄: {output_dir}")
    print(f"{'='*60}\n")
    
    stats = {
        'processed': 0,
        'skipped': 0,
        'too_long': 0,
        'max_tokens': 0,
        'total_segments': 0
    }
    
    try:
        # 讀取 CSV
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                filename = row.get('filename', '')
                disassembly = row.get('disassembly', '')
                
                if not filename or not disassembly.strip():
                    stats['skipped'] += 1
                    continue
                
                # 清理檔名 (移除 .exe 和特殊字元)
                safe_filename = re.sub(r'[^\w\-]', '_', filename.rsplit('.', 1)[0])
                
                # 為該檔案建立專屬資料夾
                file_output_dir = os.path.join(output_dir, safe_filename)
                os.makedirs(file_output_dir, exist_ok=True)
                
                # 切割指令 (以 </s> 為分隔符)
                instructions = [s.strip() for s in disassembly.split("</s>") if s.strip()]
                total_inst = len(instructions)
                
                if total_inst == 0:
                    stats['skipped'] += 1
                    continue
                
                # 每 N 條指令切一段
                chunks = [instructions[i:i+N] for i in range(0, total_inst, N)]
                
                print(f"📄 {filename}")
                print(f"   總指令數: {total_inst}")
                print(f"   切分段數: {len(chunks)}")
                
                for j, chunk in enumerate(chunks, 1):
                    # 重新組合成文字
                    chunk_text = " </s> ".join(chunk) + " </s>"
                    
                    # 計算 token 數 (以空白分割)
                    token_count = len(chunk_text.split())
                    stats['max_tokens'] = max(stats['max_tokens'], token_count)
                    
                    # 檢查是否超過限制
                    if token_count > TOKEN_LIMIT:
                        print(f"   ⚠️  段落 {j}: {token_count} tokens (超過 {TOKEN_LIMIT})")
                        stats['too_long'] += 1
                    
                    # 寫入檔案
                    segment_filename = f"{safe_filename}_{j}.txt"
                    segment_path = os.path.join(file_output_dir, segment_filename)
                    
                    with open(segment_path, 'w', encoding='utf-8') as f:
                        f.write(chunk_text)
                    
                    stats['total_segments'] += 1
                
                print(f"   ✅ 已儲存至: {file_output_dir}/\n")
                stats['processed'] += 1
        
        # 顯示統計結果
        print(f"\n{'='*60}")
        print(f"✅ 分段完成!")
        print(f"{'='*60}")
        print(f"📊 處理檔案數: {stats['processed']}")
        print(f"📊 跳過檔案數: {stats['skipped']}")
        print(f"📊 總段落數: {stats['total_segments']}")
        print(f"⚠️  超過 {TOKEN_LIMIT} tokens 的段落: {stats['too_long']}")
        print(f"📏 最大 token 數: {stats['max_tokens']}")
        print(f"{'='*60}\n")
        
        return True
        
    except Exception as e:
        print(f"❌ 分段處理失敗: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python segment_disasm.py <disasm_csv_path>")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    success = segment_disasm_csv(csv_path)
    
    sys.exit(0 if success else 1)