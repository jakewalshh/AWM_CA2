(function () {
    const config = window.appConfig || {};
    const countiesUrl = config.countiesUrl;
    const liveUpdateConfig = config.liveUpdateConfig || {};
    const routingConfig = { endpoint: config.routingEndpoint || '/api/route/' };

    const map = L.map('map').setView([53.35, -8.0], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    map.on('click', handleMapClick);

    const lorryMarkers = {};
    let countyLayer = null;
    let countiesVisible = false;
    let countiesDataPromise = null;
    let selectedOrigin = null;
    let selectedDestination = null;
    let routeLine = null;
    let destinationMarker = null;

    // Track user's live location
    let liveLocationWatchId = null;
    let userMarker = null;
    let hasCenteredOnUser = false;

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

                    listHtml += `
                        <div class="list-group-item d-flex justify-content-between align-items-center lorries-card" data-id="${lorryId}">
                            <div>
                                <strong>${lorryName}</strong><br>
                                <small class="text-muted">${new Date(location.timestamp).toLocaleString()}</small>
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

    function loadCountyData() {
        if (!countiesUrl) {
            return Promise.reject(new Error('No counties data URL configured.'));
        }
        if (!countiesDataPromise) {
            countiesDataPromise = fetch(countiesUrl).then(resp => resp.json());
        }
        return countiesDataPromise;
    }

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

    function startLiveLocation() {
        const btn = document.getElementById('live-location-btn');
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '📡 Starting...';
        }

        liveLocationWatchId = navigator.geolocation.watchPosition(
            (position) => {
                handleLiveLocationUpdate(position.coords.latitude, position.coords.longitude);
                if (btn) {
                    btn.innerHTML = '⏸️ Stop Live Location';
                    btn.disabled = false;
                }
            },
            (err) => {
                console.warn('Failed to get location:', err);
                alert('Unable to access your location.');
                stopLiveLocation();
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 20000
            }
        );
    }

    function stopLiveLocation() {
        const btn = document.getElementById('live-location-btn');
        if (liveLocationWatchId !== null) {
            navigator.geolocation.clearWatch(liveLocationWatchId);
        }
        liveLocationWatchId = null;
        hasCenteredOnUser = false;

        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }

        if (btn) {
            btn.innerHTML = '📡 Start Live Location';
            btn.disabled = false;
        }
    }

    function toggleLiveLocation() {
        if (liveLocationWatchId !== null) {
            stopLiveLocation();
        } else {
            startLiveLocation();
        }
    }

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

    function postLiveLocation(lat, lon) {
        if (!liveUpdateConfig.ingestUrl || !liveUpdateConfig.ingestToken || !liveUpdateConfig.lorryId) {
            return;
        }

        fetch(liveUpdateConfig.ingestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-INGEST-TOKEN': liveUpdateConfig.ingestToken
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

    function attachLorryClick(lorryId, lorryName, marker) {
        marker.off('click');
        marker.on('click', () => {
            const { lat, lng } = marker.getLatLng();
            setOrigin(lorryId, lorryName, lat, lng);
        });
    }

    function handleMapClick(e) {
        setDestination(e.latlng.lat, e.latlng.lng);
    }

    function setOrigin(lorryId, lorryName, lat, lon) {
        selectedOrigin = { lorryId, lorryName, lat, lon };
        setRouteStatus(`Origin set to ${lorryName} (${lat.toFixed(4)}, ${lon.toFixed(4)}). Click the map to choose a destination.`, 'info');
        tryFetchRoute();
    }

    function setDestination(lat, lon) {
        selectedDestination = { lat, lon };
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
        setRouteStatus(`Destination set at ${lat.toFixed(4)}, ${lon.toFixed(4)}${selectedOrigin ? '. Fetching route…' : '. Click a lorry to set origin.'}`, selectedOrigin ? 'info' : 'muted');
        tryFetchRoute();
    }

    function tryFetchRoute() {
        if (!selectedOrigin || !selectedDestination) {
            return;
        }
        fetchRoute(selectedOrigin, selectedDestination);
    }

    async function fetchRoute(origin, destination) {
        setRouteStatus('Fetching route...', 'info');
        clearRoute();

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

    function drawRoute(route) {
        const points = route.legs[0].points.map(p => [p.latitude, p.longitude]);
        routeLine = L.polyline(points, { color: '#16a34a', weight: 5, opacity: 0.8 }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });

        const summary = route.summary || {};
        const km = summary.lengthInMeters ? (summary.lengthInMeters / 1000).toFixed(1) : null;
        const mins = summary.travelTimeInSeconds ? Math.round(summary.travelTimeInSeconds / 60) : null;
        const stats = km && mins ? `${km} km, ~${mins} min` : 'Route ready';
        setRouteStatus(`${stats} from ${selectedOrigin.lorryName} to destination.`, 'success');
    }

    function clearRoute() {
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }
    }

    function setRouteStatus(text, tone = 'muted') {
        const el = document.getElementById('route-status');
        if (!el) return;
        el.classList.remove('text-muted', 'text-success', 'text-danger', 'text-primary');
        const cls = tone === 'success' ? 'text-success' : tone === 'error' ? 'text-danger' : tone === 'info' ? 'text-primary' : 'text-muted';
        el.classList.add(cls);
        el.textContent = text;
    }

    // Auto-refresh every 15 seconds
    updateFleet();
    setInterval(updateFleet, 15000);

    // Expose functions for inline handlers
    window.updateFleet = updateFleet;
    window.toggleCounties = toggleCounties;
    window.toggleLiveLocation = toggleLiveLocation;
})();
