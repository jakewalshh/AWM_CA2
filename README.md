# Fleet Tracker (GeoDjango + Leaflet)

A live fleet-tracking PWA with routing (TomTom), POIs (Overpass), and per-lorry accounts. Runs with PostGIS, Django/DRF, Gunicorn, and Nginx. Cloud-hosted at:  
https://fleettracker-webapp.azurewebsites.net/

while it doesn't have a companion mobile app it does adapt to screen sizes, tested on iPhone 13 mini and iPhone 15.

Example login (to try it out)
- Username: `Lorry10Tayto`
- Password: `taytopassword`

What the app does (in plain terms)
- Live map of lorries: Every 15 seconds the frontend hits `/api/latest-locations/` and redraws markers/list from the latest DB rows.
- Routing: Click a lorry (sets origin) → click a destination → we proxy TomTom for a route → draw it → optionally save it to the DB for reload later.
- POIs: Load fuel/toll POIs along the latest saved route for a lorry via Overpass, render as GeoJSON markers.
- Live tracking: Start live tracking to post your geolocation to the server on a loop; if a destination is stored, the route is refreshed live.
- Closest lorry: Client-side distance check to highlight the nearest other lorry to you.
- Offline-ish/PWA: Manifest + service worker to cache static assets; APIs always go to the network for fresh data.

Quick use guide (web UI)
1) Log in (use the example or your own account).
2) Click “Refresh Fleet” to load markers manually; click a lorry to see origin and its saved route (if it has one).
3) Click on the tayto lorry, then the map to set a destination; a route is fetched and drawn. The “Clear Route” button removes it. This will only work for your authed lorry
4) Toggle live location to send your position; your lorry marker updates and can be used for routing.
5) Click a lorry to show its route, clic “Load POIs” to fetch fuel/toll points along the latest saved route for that lorry.
6) Toggle county borders to show/hide boundary overlays (loaded from a GeoJSON URL).
7) Try out the closest lorry feature, remember, it finds the closest lorry to the one you are logged in as, not the lorry you have selected on the page
How the pieces talk to each other
- Frontend (Leaflet + JS): Renders the map, polls `/api/latest-locations/`, posts live locations, requests routes/POIs, and draws polylines/markers. Static assets are served by Nginx from `/staticfiles`.
- Backend (Django + DRF + GeoDjango): Auth/session/CSRF, APIs for lorries/locations/routes/POIs, and a TomTom proxy. Geo fields live in PostGIS; serializers turn geometries into lat/lon arrays for the frontend.
- Data flow (routes): JS calls `/api/route/` → backend proxies TomTom → JS draws and POSTs to `/api/routes/` to save → DB stores LineString/Point → later loads use `/api/lorry/<id>/route/`.
- **NOTE** The reasoning for the live routing updating location and regenerating route every interval instead of iterating along the saved route is for accurate timing. My concern when creating the feature was more based on timing rather then route following accuracy, which was discussed in the demo. traffic=true is enabled in the TomTom call with computeTravelTimeFor=all. As far as I know, iterating along the saved route would work, but the ETA would decrease in non accurate interavals.
- Data flow (live locations): Browser geolocation → POST `/api/ingest-location/` → DB insert → next poll of `/api/latest-locations/` reflects it on the map.
- County borders: Not in the DB; fetched as GeoJSON from `countiesUrl` and rendered as polygons.

Cloud hosting (Azure, high level)
- Images: Built the web and nginx images for linux/amd64 (this wasa big issue for me, caused my first attempts to build on cloud to fail which I didn't understand straight away) and pushed to Azure Container Registry (`fleettrackerregistry.azurecr.io`).
- Compose: A trimmed `docker-compose.azure.yml` points to those images and a shared `staticfiles` volume.
- App Service: Configured the Web App (`fleettracker-webapp`) to use the compose file with ACR creds.
- Env vars: Set SECRET_KEY, DB host/user/pass, ALLOWED_HOSTS/CSRF, API keys, etc., via App Settings.
- Storage: Azure Files share mounted at `/staticfiles` so Nginx and the web container share collected static assets.
- Database: Managed Postgres Flexible Server with `CREATE EXTENSION postgis;` applied. Data imported via `pg_dump`/`psql` after stripping disallowed extensions.
- Entrypoint: On container start, the web entrypoint waits for Postgres, ensures PostGIS, runs migrations, collects static, then starts Gunicorn; Nginx proxies `/` to Gunicorn and serves `/static/` directly.

How to run locally (dev)
1) Create a `.env` at the project root, put these intto `.env` and set DB creds/keys. 
POSTGRES_DB=fleettracker
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
DATABASE_HOST=db
DATABASE_PORT=5432

SECRET_KEY=your-django-key
DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost,http://127.0.0.1
CORS_ALLOW_ALL_ORIGINS=False

PGADMIN_EMAIL=user@email.com
PGADMIN_PASSWORD=your-password

TOMTOM_API_KEY=your-tomtom-api-key
OVERPASS_URL=https://overpass-api.de/api/interpreter

2) `docker compose up --build` (uses local db, bind mounts).  
3) Visit `http://localhost/`. Admin: create a superuser with `python manage.py createsuperuser` inside the web container. 
4) When logged in, create the lorrys. First create a user, e.g. HelloSirUser. Then create a lorry, name it anything e.g. LorryXYZ, and set it to the User. This will create a unique `lorry_id` tied to the lorry. Then add a location and set it to the lorry. **KEEP IN MIND** if you make multiple lorries, deleting one will **NOT** update the lorry_ids, if you delete lorry_id=3, the next lorry you create will not be lorry_id=3 but lorry_id=4. 
5) Now when you return to the page, login as your lorry or stay as admin (admin defaults to lorry_id=2) 

Notes on auth
- Standard Django auth/session/CSRF. APIs require login; writes are restricted to admins/owners (`ReadOnlyOrAdmin`, `is_lorry_owner`, `is_overall_admin`).  
- CSRF token is read by JS from the `csrftoken` cookie and sent on POST/DELETE.  

Repo structure (quick)
- `tracking/` Django app (models, serializers, views, static, templates).  
- `docker/entrypoint.sh` startup script (wait for DB, migrate, collectstatic, run Gunicorn).  
- `docker/nginx/Dockerfile` + `nginx.conf` for the reverse proxy/static server.  
- `docker/postgres/init-db.sql` (PostGIS init for containerized DB).  
- `docker-compose.yml` (dev), `docker-compose.prod.yml` (prod overrides), `docker-compose.azure.yml` (ACR/App Service).  

Have fun exploring the map—start with `Lorry10Tayto` / `taytopassword` if you just want to click around.***
