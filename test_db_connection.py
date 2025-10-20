# test_db_connection.py
from sqlalchemy import create_engine, Column, Integer, String, LargeBinary, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 這裡改成你的 PostgreSQL 帳號資訊
DATABASE_URL = "postgresql://maluser:malpass@localhost/malvec"

# 建立連線
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 範例資料表：反組譯結果
class DisasmChunk(Base):
    __tablename__ = "disasm_chunks"
    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, index=True)
    chunk_id = Column(Integer)
    text = Column(String)
    embedding = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# 嘗試建立資料表
try:
    Base.metadata.create_all(bind=engine)
    print("✅ 成功建立資料表 disasm_chunks！")

    # 測試插入一筆資料
    db = SessionLocal()
    new_chunk = DisasmChunk(file_name="test.exe", chunk_id=0, text="mov eax, ebx")
    db.add(new_chunk)
    db.commit()
    print("✅ 測試插入資料成功！")

    # 驗證查詢
    chunks = db.query(DisasmChunk).all()
    print(f"📦 資料庫目前共有 {len(chunks)} 筆資料。")
    for c in chunks:
        print(f"→ id={c.id}, file_name={c.file_name}, text={c.text}")

    db.close()

except Exception as e:
    print("❌ 發生錯誤：", e)

