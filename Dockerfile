FROM python:3.12-slim

WORKDIR /app
COPY server.py ./
COPY mutt ./mutt
COPY public ./public

# Data goes to MUTT_DATA_DIR if set, else to a volume mounted at /data (or a
# Railway volume), else to /app/data, which is lost when the container is
# replaced. Hosts put a proxy in front, so trust its forwarded headers.
ENV HOST=0.0.0.0 \
    PORT=8080 \
    MUTT_IN_CONTAINER=1 \
    MUTT_TRUST_PROXY=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8080
CMD ["python", "server.py"]
