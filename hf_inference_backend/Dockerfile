FROM python:3.10-slim

WORKDIR /workspace
COPY requirements.txt .
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git fonts-dejavu-core && \
    pip install -r requirements.txt && \
    rm -rf /var/lib/apt/lists/*

COPY app ./app

ENV MODEL_REPO_ID="" \
    MODEL_FILENAME="pytorch_model.bin" \
    FAMILY_LABELS="FAMILY_A,FAMILY_B,FAMILY_C" \
    INPUT_DIM="768" \
    HIDDEN_DIM="256"

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
