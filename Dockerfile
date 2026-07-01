FROM python:3.12-slim

RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid 1000 --no-create-home --home-dir /app appuser

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY gemini_web2api/ ./gemini_web2api/

EXPOSE 8081

USER appuser

# config.json is provided at runtime via a bind mount (see docker-compose.prod.yml)
CMD ["python", "-m", "gemini_web2api", "--config", "/app/config.json"]
