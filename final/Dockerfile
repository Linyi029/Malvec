FROM python:3

# 安裝必要工具：file, wget
RUN apt update && apt install -y wget file nano osslsigncode \
 && wget https://github.com/upx/upx/releases/download/v5.0.0/upx-5.0.0-amd64_linux.tar.xz \
 && tar -xf upx-5.0.0-amd64_linux.tar.xz \
 && cp upx-5.0.0-amd64_linux/upx /usr/local/bin/ \
 && rm -rf upx-5.0.0-amd64_linux* 
 

# 安裝最新版 UPX
# 安裝 Python 套件
RUN pip install pefile capstone requests

# 複製分析腳本
COPY disasm.py /disasm.py
COPY unpack.py /unpack.py


CMD ["bash"]

