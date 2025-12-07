# Use official Python slim image
FROM python:3.12-slim

# Install system deps for PostGIS and GeoDjango
RUN apt-get update && apt-get install -y \
    gdal-bin libgdal-dev libgeos-dev libproj-dev postgresql-client \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "fleettracker.wsgi:application"]

RUN python manage.py collectstatic --noinput
