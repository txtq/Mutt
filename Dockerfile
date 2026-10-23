FROM python:3.12-slim

WORKDIR /app
COPY server.py ./
COPY mutt ./mutt
COPY public ./public

ENV HOST=0.0.0.0 \
    PORT=8080 \
    MUTT_DATA_DIR=/data \
    PYTHONUNBUFFERED=1

VOLUME ["/data"]
EXPOSE 8080
CMD ["python", "server.py"]
