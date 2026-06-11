FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# pg_dump 설치 (P3-07 백업 기능용)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# 빌드 환경에 따라 PyPI 인덱스 응답이 느릴 때 기본 15초 타임아웃으로 인한
# 가짜 "ResolutionImpossible" 실패를 방지하기 위해 타임아웃/재시도 상향
RUN pip install --no-cache-dir --timeout 100 --retries 10 -r requirements.txt

COPY app ./app
COPY migrations ./migrations

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
