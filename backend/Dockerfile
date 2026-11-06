FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-prod.txt
COPY . .
RUN mkdir -p uploads/pending
EXPOSE 8000
# keystore/aes_key.hex and .env are mounted at runtime (never baked into the image)
CMD ["gunicorn", "ehr_backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-"]
