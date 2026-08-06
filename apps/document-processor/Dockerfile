FROM python:3.12-slim

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    clamav clamav-daemon libreoffice-core libreoffice-writer libreoffice-calc \
    poppler-utils qpdf tesseract-ocr && \
	 freshclam --quiet && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /processor
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py .

ENV PYTHONUNBUFFERED=1
CMD ["python", "worker.py"]
