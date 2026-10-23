FROM python:3.12-slim

WORKDIR /app
COPY server.py ./
COPY mutt ./mutt
COPY public ./public

# Data goes to MUTT_DATA_DIR if set, else to a Railway volume if one is
# attached, else to /app/data (lost when the container is replaced).
ENV HOST=0.0.0.0 \
    PORT=8080 \
    PYTHONUNBUFFERED=1

EXPOSE 8080
CMD ["python", "server.py"]
