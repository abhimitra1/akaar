FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
# Retries/timeout because this dev box's PyPI access is flaky (transient read timeouts).
RUN pip install --no-cache-dir --retries 20 --timeout 120 -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
