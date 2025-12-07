(function () {
    const config = window.appConfig || {};
    const countiesUrl = config.countiesUrl;
    const liveUpdateConfig = config.liveUpdateConfig || {};
    const routingConfig = { endpoint: config.routingEndpoint || '/api/route/' };
    // Grabs the CSRF token from cookies for authenticated POST/DELETE
    function getCsrfToken() {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    const map = L.map('map').setView([53.35, -8.0], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    let mapClickActive = false;

    const lorryMarkers = {};
    let countyLayer = null;
    let countiesVisible = false;
    let countiesDataPromise = null;
    let selectedOrigin = null;
    let selectedDestination = null;
    let routeLine = null;
    let destinationMarker = null;
    let clearRouteBtn = null;
    let poiLayer = null;
    let activeRouteInfoEl = null;
    // Live tracking/routing for the current lorry (falls back to id 2)
    const LIVE_TRACK_LORRY_ID = config.lorryId || 2;
    const LIVE_TRACK_LORRY_NAME = config.lorryName || 'Your Lorry';
    let liveTrackTimer = null;
    let liveTrackDestination = null;
    let latestLiveLocation = null;

    // Track user's live location marker
    let userMarker = null;
    let hasCenteredOnUser = false;

    // Pulls latest lorry locations and refreshes markers/list
    function updateFleet() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '🔄 Updating...';
        }

        fetch('/api/latest-locations/')
            .then(response => response.json())
            .then(data => {
                let listHtml = '';
                data.forEach(location => {
                    const lat = location.latitude;
                    const lon = location.longitude;
                    if (lat === null || lon === null || lat === undefined || lon === undefined) {
                        return;
                    }
                    const lorryId = location.lorry;
                    const lorryName = location.lorry_name;
                    const popupHtml = `<b>${lorryName}</b><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`;

                    // Pull ETA and destination if available
                    const etaMins = location.travel_time_seconds ? Math.round(location.travel_time_seconds / 60) : null;
                    const distanceKm = location.distance_meters ? (location.distance_meters / 1000).toFixed(1) : null;
                    const etaText = etaMins ? `${etaMins} min` : 'ETA n/a';
                    const distText = distanceKm ? `${distanceKm} km` : 'Dist n/a';

                    listHtml += `
                        <div class="list-group-item d-flex justify-content-between align-items-center lorries-card" data-id="${lorryId}">
                            <div>
                                <strong>${lorryName}</strong><br>
                                <small class="text-muted">${new Date(location.timestamp).toLocaleString()}</small><br>
                                <small class="text-info">ETA: ${etaText} • Dist: ${distText}</small>
                            </div>
                            <span class="badge bg-primary rounded-pill">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>
                        </div>
                    `;

                    if (lorryMarkers[lorryId]) {
                        lorryMarkers[lorryId].setLatLng([lat, lon]).bindPopup(popupHtml);
                    } else {
                        lorryMarkers[lorryId] = L.marker([lat, lon], {
                            icon: L.divIcon({
                                className: 'lorry-marker',
                                html: '🚛',
                                iconSize: [30, 30],
                                iconAnchor: [15, 15]
                            })
                        })
                        .addTo(map)
                        .bindPopup(popupHtml);
                    }

                    attachLorryClick(lorryId, lorryName, lorryMarkers[lorryId]);
                });

                const listEl = document.getElementById('lorry-list');
                if (listEl) {
                    listEl.innerHTML = listHtml || '<div class="list-group-item text-center text-muted p-4">No lorries online</div>';
                }
            })
            .catch(error => {
                console.error('Error:', error);
                const listEl = document.getElementById('lorry-list');
                if (listEl) {
                    listEl.innerHTML = '<div class="list-group-item text-center text-danger p-4">Error loading fleet</div>';
                }
            })
            .finally(() => {
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '🔄 Refresh Fleet';
                }
            });
    }

    // loads county GeoJSON data
    function loadCountyData() {
        if (!countiesUrl) {
            return Promise.reject(new Error('No counties data URL configured.'));
        }
        if (!countiesDataPromise) {
            countiesDataPromise = fetch(countiesUrl).then(resp => resp.json());
        }
        return countiesDataPromise;
    }

    // Shows or hides county boundary layer
    function toggleCounties() {
        const btn = document.getElementById('toggle-counties-btn');
        if (countiesVisible) {
            if (countyLayer) {
                map.removeLayer(countyLayer);
            }
            countiesVisible = false;
            if (btn) btn.innerHTML = '🗺️ Show County Borders';
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '🗺️ Loading...';
        }

        loadCountyData()
            .then(geojson => {
                if (!countyLayer) {
                    countyLayer = L.geoJSON(geojson, {
                        style: {
                            color: '#1d4ed8',
                            weight: 2,
                            fill: false
                        }
                    }).addTo(map);
                } else {
                    countyLayer.addTo(map);
                }
                countiesVisible = true;
                if (btn) btn.innerHTML = '🗺️ Hide County Borders';
            })
            .catch(err => {
                console.error('Error loading county borders:', err);
                if (btn) btn.innerHTML = '🗺️ Show County Borders';
            })
            .finally(() => {
                if (btn) btn.disabled = false;
            });
    }

    // Sends live location to server and updates UI
    function handleLiveLocationUpdate(lat, lon) {
        const latLng = [lat, lon];

        if (userMarker) {
            userMarker.setLatLng(latLng);
        } else {
            userMarker = L.circleMarker(latLng, {
                radius: 8,
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.9
            })
            .addTo(map)
            .bindPopup('• Your Location')
            .openPopup();
        }

        if (!hasCenteredOnUser) {
            map.setView(latLng, 13);
            hasCenteredOnUser = true;
        }

        postLiveLocation(lat, lon);
    }

    // Posts the current position to ingest endpoint
    function postLiveLocation(lat, lon) {
        if (!liveUpdateConfig.ingestUrl || !liveUpdateConfig.lorryId) {
            return;
        }

        fetch(liveUpdateConfig.ingestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                lorry_id: liveUpdateConfig.lorryId,
                lat: lat,
                lon: lon
            })
        }).catch(err => {
            console.warn('Failed to post live location:', err);
        });
    }

    // Binds click handlers to a lorry marker and list item
    function attachLorryClick(lorryId, lorryName, marker) {
        marker.off('click');
        marker.on('click', () => {
            const { lat, lng } = marker.getLatLng();
            setOrigin(lorryId, lorryName, lat, lng);
        });
    }

    // Handles map click for choosing destination or clearing selection
    function handleMapClick(e) {
        if (!mapClickActive) {
            // Not in destination set mode: hide current route/POIs
            clearDrawnRoute();
            clearActiveRouteInfo();
            clearPoiLayer();
            setRouteStatus('Route hidden. Click a lorry to view or set a destination.', 'muted');
            return;
        }
        setDestination(e.latlng.lat, e.latlng.lng);
        disableMapClick();
    }

    // Selects a lorry as origin and attempts to load a stored route
    function setOrigin(lorryId, lorryName, lat, lon) {
        // Clear drawn layers for previous selection
        clearDrawnRoute();
        selectedOrigin = { lorryId, lorryName, lat, lon };
        disableClearButton();
        clearActiveRouteInfo();
        clearPoiLayer();
        setRouteStatus(`Origin set to ${lorryName} (${lat.toFixed(4)}, ${lon.toFixed(4)}). Checking for stored route...`, 'info');
        loadStoredRoute(lorryId, lorryName);
    }

    // Sets destination point and triggers route fetch
    function setDestination(lat, lon) {
        selectedDestination = { lat, lon };
        ensureDestinationMarker(lat, lon);
        setRouteStatus(`Destination set at ${lat.toFixed(4)}, ${lon.toFixed(4)}${selectedOrigin ? '. Fetching route…' : '. Click a lorry to set origin.'}`, selectedOrigin ? 'info' : 'muted');
        tryFetchRoute();
    }

    // Kicks off a route fetch when origin and destination are ready
    function tryFetchRoute() {
        if (!selectedOrigin || !selectedDestination) {
            return;
        }
        fetchRoute(selectedOrigin, selectedDestination);
    }

    // Calls backend to calculate route via TomTom 
    async function fetchRoute(origin, destination) {
        setRouteStatus('Fetching route...', 'info');

        const originStr = `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}`;
        const destStr = `${destination.lat.toFixed(5)},${destination.lon.toFixed(5)}`;

        try {
            const resp = await fetch(`${routingConfig.endpoint}?origin=${originStr}&dest=${destStr}`);
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(text || 'Route request failed');
            }
            const data = await resp.json();
            const route = data.routes && data.routes[0];
            if (!route || !route.legs || !route.legs[0] || !route.legs[0].points) {
                throw new Error('No route returned');
            }
            drawRoute(route);
        } catch (err) {
            console.error('Route error:', err);
            setRouteStatus(`Unable to fetch route: ${err.message}`, 'error');
        }
    }

    // Renders a TomTom route response and saves it
    function drawRoute(route) {
        const points = route.legs[0].points.map(p => [p.latitude, p.longitude]);
        drawRouteFromPoints(points);

        // Persist route server-side
        if (selectedOrigin && selectedDestination) {
            const summary = route.summary || {};
            saveRouteToServer(selectedOrigin.lorryId, points, selectedDestination, summary);
            setActiveRouteInfo(summary.lengthInMeters, summary.travelTimeInSeconds, selectedOrigin.lorryName);
        }

        const summary = route.summary || {};
        const km = summary.lengthInMeters ? (summary.lengthInMeters / 1000).toFixed(1) : null;
        const mins = summary.travelTimeInSeconds ? Math.round(summary.travelTimeInSeconds / 60) : null;
        const stats = km && mins ? `${km} km, ~${mins} min` : 'Route ready';
        setRouteStatus(`${stats} from ${selectedOrigin.lorryName} to destination.`, 'success');
        disableMapClick();
        enableClearButton();
    }

    // Clears the active route and optionally keeps the origin selected
    function clearRoute(keepOrigin = false) {
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }
        if (destinationMarker) {
            map.removeLayer(destinationMarker);
            destinationMarker = null;
        }
        clearPoiLayer();
        selectedDestination = null;
        disableMapClick();
        disableClearButton();
        if (selectedOrigin) {
            clearStoredRoute(selectedOrigin.lorryId);
        }
        clearActiveRouteInfo();
        if (keepOrigin && selectedOrigin) {
            setRouteStatus(`Route cleared. Click the map to choose a destination for ${selectedOrigin.lorryName}.`, 'muted');
            enableMapClick();
        } else {
            if (!keepOrigin) {
                selectedOrigin = null;
            }
            setRouteStatus('Route cleared. Click a lorry to set origin, then click the map for destination.', 'muted');
        }
    }

    // Removes any drawn route and destination marker from the map
    function clearDrawnRoute() {
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }
        if (destinationMarker) {
            map.removeLayer(destinationMarker);
            destinationMarker = null;
        }
        selectedDestination = null;
        disableMapClick();
        disableClearButton();
        clearPoiLayer();
        clearActiveRouteInfo();
    }

    // Draws a polyline for a list of lat/lon points
    function drawRouteFromPoints(points) {
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }
        routeLine = L.polyline(points, { color: '#16a34a', weight: 5, opacity: 0.8 }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
        enableClearButton();
    }

    // Removes POI markers from the map
    function clearPoiLayer() {
        if (poiLayer) {
            map.removeLayer(poiLayer);
            poiLayer = null;
        }
    }

    // Turns on map click handler for destination selection
    function enableMapClick() {
        map.off('click', handleMapClick);
        map.on('click', handleMapClick);
        mapClickActive = true;
    }

    // Turns off map click handler
    function disableMapClick() {
        if (mapClickActive) {
            map.off('click', handleMapClick);
            mapClickActive = false;
        }
    }

    // Enables the clear route button
    function enableClearButton() {
        if (!clearRouteBtn) {
            clearRouteBtn = document.getElementById('clear-route-btn');
        }
        if (clearRouteBtn) {
            clearRouteBtn.disabled = false;
        }
    }

    // Disables the clear route button
    function disableClearButton() {
        if (!clearRouteBtn) {
            clearRouteBtn = document.getElementById('clear-route-btn');
        }
        if (clearRouteBtn) {
            clearRouteBtn.disabled = true;
        }
    }

    // Updates the route status message with a tone
    function setRouteStatus(text, tone = 'muted') {
        const el = document.getElementById('route-status');
        if (!el) return;
        el.classList.remove('text-muted', 'text-success', 'text-danger', 'text-primary');
        const cls = tone === 'success' ? 'text-success' : tone === 'error' ? 'text-danger' : tone === 'info' ? 'text-primary' : 'text-muted';
        el.classList.add(cls);
        el.textContent = text;
    }

    // Places or moves the destination marker on the map
    function ensureDestinationMarker(lat, lon) {
        if (destinationMarker) {
            destinationMarker.setLatLng([lat, lon]);
        } else {
            destinationMarker = L.marker([lat, lon], {
                icon: L.divIcon({
                    className: 'destination-marker',
                    html: '🎯',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);
        }
    }

    // Shows distance and ETA for the active route
    function setActiveRouteInfo(distanceMeters, travelSeconds, lorryName) {
        if (!activeRouteInfoEl) {
            activeRouteInfoEl = document.getElementById('active-route-info');
        }
        if (!activeRouteInfoEl) return;
        const km = distanceMeters ? (distanceMeters / 1000).toFixed(1) : null;
        const mins = travelSeconds ? Math.round(travelSeconds / 60) : null;
        const parts = [];
        if (km) parts.push(`${km} km`);
        if (mins) parts.push(`~${mins} min`);
        const meta = parts.length ? parts.join(', ') : 'Distance/time unavailable';
        activeRouteInfoEl.innerHTML = `<strong>${lorryName || 'Route'}</strong><br>${meta}`;
        activeRouteInfoEl.style.display = 'block';
    }

    // Hides the route info panel
    function clearActiveRouteInfo() {
        if (!activeRouteInfoEl) {
            activeRouteInfoEl = document.getElementById('active-route-info');
        }
        if (activeRouteInfoEl) {
            activeRouteInfoEl.style.display = 'none';
            activeRouteInfoEl.innerHTML = '';
        }
    }

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').catch(err => {
                console.warn('SW registration failed', err);
            });
        });
    }

    // --- Combined live location + routing for configured lorry ---
    // Toggles the combined live tracking and routing loop
    async function toggleLiveTrack() {
        if (liveTrackTimer) {
            stopLiveTrack();
        } else {
            await startLiveTrack();
        }
    }

    // Starts live location updates and periodic route refresh
    async function startLiveTrack() {
        const btn = document.getElementById('live-track-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'Starting...';
        }
        setRouteStatus('Starting live tracking...', 'info');

        if (!navigator.geolocation) {
            setRouteStatus('Geolocation not supported by your browser.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '▶️ Live Track';
            }
            return;
        }

        // Load stored destination for configured lorry
        try {
            const resp = await fetch(`/api/lorry/${LIVE_TRACK_LORRY_ID}/route/`);
            if (resp.status === 204) {
                throw new Error('No stored route. Set a destination first.');
            }
            if (!resp.ok) {
                throw new Error(await resp.text() || 'Failed to load stored route');
            }
            const data = await resp.json();
            if (!data.destination) {
                throw new Error('No destination on stored route.');
            }
            liveTrackDestination = { lat: data.destination[0], lon: data.destination[1] };
            ensureDestinationMarker(liveTrackDestination.lat, liveTrackDestination.lon);
            selectedOrigin = { lorryId: LIVE_TRACK_LORRY_ID, lorryName: LIVE_TRACK_LORRY_NAME, lat: null, lon: null };
        } catch (err) {
            console.error(err);
            setRouteStatus(err.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '▶️ Live Track';
            }
            return;
        }

        await liveTrackTick();
        liveTrackTimer = setInterval(liveTrackTick, 10000); // every 10s: update location, then route

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '⏸️ Stop Live Track';
        }
    }

    // Stops live tracking timers and resets UI
    function stopLiveTrack() {
        const btn = document.getElementById('live-track-btn');
        if (liveTrackTimer) {
            clearInterval(liveTrackTimer);
            liveTrackTimer = null;
        }
        setRouteStatus('Live tracking stopped.', 'muted');
        if (btn) {
            btn.innerHTML = '▶️ Live Track';
            btn.disabled = false;
        }
    }

    // Performs one live location read and schedules route refresh
    async function liveTrackTick() {
        if (!liveTrackDestination) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                latestLiveLocation = { lat, lon };
                handleLiveLocationUpdate(lat, lon);
                setTimeout(updateRouteFromLatestLocation, 1000);
            },
            (err) => {
                console.warn('Live tracking: failed to get location', err);
                setRouteStatus('Live tracking: unable to access location.', 'error');
            },
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 15000
            }
        );
    }

    // Recalculates the route from the latest live position
    async function updateRouteFromLatestLocation() {
        if (!latestLiveLocation || !liveTrackDestination) return;

        // Stop if close to destination
        const distToDest = map.distance([latestLiveLocation.lat, latestLiveLocation.lon], [liveTrackDestination.lat, liveTrackDestination.lon]);
        if (distToDest < 50) {
            setRouteStatus('Arrived at destination.', 'success');
            stopLiveTrack();
            return;
        }

        const originStr = `${latestLiveLocation.lat.toFixed(5)},${latestLiveLocation.lon.toFixed(5)}`;
        const destStr = `${liveTrackDestination.lat.toFixed(5)},${liveTrackDestination.lon.toFixed(5)}`;
        try {
            const resp = await fetch(`${routingConfig.endpoint}?origin=${originStr}&dest=${destStr}`);
            if (!resp.ok) {
                throw new Error(await resp.text() || 'Route request failed');
            }
            const data = await resp.json();
            const route = data.routes && data.routes[0];
            if (!route || !route.legs || !route.legs[0] || !route.legs[0].points) {
                throw new Error('No route returned');
            }
            const points = route.legs[0].points.map(p => [p.latitude, p.longitude]);
            drawRouteFromPoints(points);
            const summary = route.summary || {};
            setActiveRouteInfo(summary.lengthInMeters, summary.travelTimeInSeconds, LIVE_TRACK_LORRY_NAME);
            setRouteStatus('Live route updated.', 'info');
        } catch (err) {
            console.error('Live route error:', err);
            setRouteStatus(`Live route error: ${err.message}`, 'error');
        }
    }

    // Loads and displays POIs for the selected lorry route
    async function loadPois() {
        if (!selectedOrigin) {
            setRouteStatus('Select a lorry with a stored route before loading POIs.', 'error');
            return;
        }

        // Toggle off if already loaded
        if (poiLayer) {
            clearPoiLayer();
            setRouteStatus('POIs hidden.', 'muted');
            return;
        }

        setRouteStatus('Loading POIs...', 'info');
        try {
            const resp = await fetch(`/api/lorry/${selectedOrigin.lorryId}/pois/`);
            if (resp.status === 204) {
                setRouteStatus('No stored route for this lorry; cannot load POIs.', 'error');
                return;
            }
            if (!resp.ok) {
                throw new Error(await resp.text() || 'Failed to load POIs');
            }
            const data = await resp.json();
            const features = data.features || [];
            if (!features.length) {
                setRouteStatus('No POIs found along this route.', 'info');
                return;
            }
            poiLayer = L.geoJSON(data, {
                pointToLayer: (feature, latlng) => {
                    const type = (feature.properties && feature.properties.type) || '';
                    const emoji = type === 'fuel' ? '⛽️' : type === 'parking' ? '🅿️' : type === 'truck_parking' ? '🅿️' : '🚧';
                    return L.marker(latlng, {
                        icon: L.divIcon({
                            className: 'poi-marker',
                            html: emoji,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })
                    });
                },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties || {};
                    const name = props.name || 'POI';
                    const type = props.type || 'poi';
                    const tags = props.tags || {};
                    const tagText = Object.entries(tags).map(([k,v]) => `${k}: ${v}`).join('<br>');
                    layer.bindPopup(`<b>${name}</b><br>Type: ${type}${tagText ? '<br><small>'+tagText+'</small>' : ''}`);
                }
            }).addTo(map);
            setRouteStatus(`Loaded ${features.length} POIs for ${selectedOrigin.lorryName}.`, 'success');
        } catch (err) {
            console.error('POI load error:', err);
            setRouteStatus(`Unable to load POIs: ${err.message}`, 'error');
        }
    }

    // Fetches and renders a stored route for a lorry
    async function loadStoredRoute(lorryId, lorryName) {
        try {
            const resp = await fetch(`/api/lorry/${lorryId}/route/`);
            if (resp.status === 204) {
                setRouteStatus(`Origin set to ${lorryName}. Click the map to choose a destination.`, 'info');
                enableMapClick();
                return;
            }
            if (!resp.ok) {
                throw new Error(await resp.text() || 'Failed to load stored route');
            }
            const data = await resp.json();
            if (!data.path || !data.destination) {
                setRouteStatus(`Origin set to ${lorryName}. Click the map to choose a destination.`, 'info');
                enableMapClick();
                return;
            }
            selectedDestination = { lat: data.destination[0], lon: data.destination[1] };
            ensureDestinationMarker(selectedDestination.lat, selectedDestination.lon);
            drawRouteFromPoints(data.path);
            disableMapClick();
            setActiveRouteInfo(data.distance_meters, data.travel_time_seconds, selectedOrigin.lorryName);
            setRouteStatus(`Showing stored route for ${lorryName}.`, 'info');
        } catch (err) {
            console.error('Load route error:', err);
            setRouteStatus(`Origin set to ${lorryName}. Could not load stored route. Click the map to choose a destination.`, 'error');
            enableMapClick();
        }
    }

    // Saves the current route to the server
    async function saveRouteToServer(lorryId, points, destination, summary) {
        try {
            await fetch('/api/routes/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    lorry: lorryId,
                    path: points, // [lat, lon]
                    destination: [destination.lat, destination.lon],
                    distance_meters: summary && summary.lengthInMeters ? summary.lengthInMeters : null,
                    travel_time_seconds: summary && summary.travelTimeInSeconds ? summary.travelTimeInSeconds : null
                })
            });
        } catch (err) {
            console.warn('Failed to save route:', err);
        }
    }

    // Clears any stored route for a lorry on the server
    async function clearStoredRoute(lorryId) {
        try {
            await fetch(`/api/lorry/${lorryId}/route/clear/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCsrfToken() }
            });
        } catch (err) {
            console.warn('Failed to clear stored route:', err);
        }
    }

    // Auto-refresh every 15 seconds
    updateFleet();
    setInterval(updateFleet, 15000);

    // Expose functions for inline handlers
    window.updateFleet = updateFleet;
    window.toggleCounties = toggleCounties;
    window.clearRoute = clearRoute;
    window.loadPois = loadPois;
    window.toggleLiveTrack = toggleLiveTrack;
    window.selectLorryFromList = (id, name, lat, lon) => setOrigin(id, name, lat, lon);
})();
