# Use official Python slim image
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system deps for PostGIS and GeoDjango
RUN apt-get update && apt-get install -y \
    gdal-bin libgdal-dev libgeos-dev libproj-dev postgresql-client \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Entrypoint will wait for DB, run migrations, collectstatic, then exec CMD
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "fleettracker.wsgi:application"]
