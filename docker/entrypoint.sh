#!/bin/bash
set -e

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${DATABASE_HOST:=db}"
: "${DATABASE_PORT:=5432}"

echo "Waiting for Postgres at ${DATABASE_HOST}:${DATABASE_PORT}..."
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
until pg_isready -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"; do
  sleep 2
done
echo "Postgres is ready."

echo "Ensuring PostGIS extension exists..."
psql "host=${DATABASE_HOST} port=${DATABASE_PORT} dbname=${POSTGRES_DB} user=${POSTGRES_USER}" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
mkdir -p /app/staticfiles
python manage.py collectstatic --noinput

echo "Starting application..."
exec "$@"
