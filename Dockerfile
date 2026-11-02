FROM python:3.12-slim

WORKDIR /app
COPY server.py ./
COPY mutt ./mutt
COPY public ./public

# Deployed on Northflank. Data goes to MUTT_DATA_DIR if set, else to a volume
# mounted at /data (attach one on the service), else to /app/data, which is
# lost when the container is replaced. Northflank puts a proxy in front, so
# trust its forwarded headers.
#
# Health check: Northflank ignores Docker's HEALTHCHECK, so set one on the
# service instead: HTTP GET /api/health on port 8080. It answers 200 with
# "persistentStorage": true once the volume is in use.
ENV HOST=0.0.0.0 \
    PORT=8080 \
    MUTT_IN_CONTAINER=1 \
    MUTT_TRUST_PROXY=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8080
CMD ["python", "server.py"]
