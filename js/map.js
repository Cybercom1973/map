// 1. Initiera kartan
const map = L.map('map').setView([62.0, 15.0], 5);

// 2. Lägg till kartlager (Standard)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Variabler
const markers = {};
let trainInfoCache = {}; 
let stationNames = {}; 
let availableProducts = new Set();
let currentFilter = 'all';

const crossingsLayer = L.layerGroup();
let crossingsLoaded = false;
const myRenderer = L.canvas({ padding: 0.5 });

// --- URL Sökning ---
const urlParams = new URLSearchParams(window.location.search);
const searchTrainId = urlParams.get('train');
let hasFocusedSearch = false;

// --- DOM ELEMENT ---
const productSelect = document.getElementById('filter-product');
const searchInput = document.getElementById('map-search-input');
const searchBtn = document.getElementById('map-search-btn');
const crossingCheckbox = document.getElementById('toggle-crossings');

// --- EVENT LISTENERS ---
if (productSelect) {
    productSelect.addEventListener('change', (e) => {
        currentFilter = e.target.value;
        updateMap(); 
    });
}
if (searchBtn) {
    searchBtn.addEventListener('click', performManualSearch);
}
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performManualSearch();
    });
}
if (crossingCheckbox) {
    crossingCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) loadCrossings();
        else if (map.hasLayer(crossingsLayer)) map.removeLayer(crossingsLayer);
    });
    if (crossingCheckbox.checked) loadCrossings();
}

// --- FUNKTIONER ---

function performManualSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    if (markers[query]) {
        const marker = markers[query];
        map.setView(marker.getLatLng(), 10);
        setTimeout(() => {
            marker.openPopup();
            marker.fire('click'); 
        }, 500);
    } else {
        alert(`Tåg ${query} hittades inte på kartan just nu.`);
    }
}

function loadCrossings() {
    if (crossingsLoaded) {
        if (!map.hasLayer(crossingsLayer)) map.addLayer(crossingsLayer);
        return;
    }
    const CACHE_KEY = 'tv_rail_crossings_v4'; 
    const CACHE_TIME = 24 * 60 * 60 * 1000; 
    const cachedData = localStorage.getItem(CACHE_KEY);
    
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            if ((Date.now() - parsed.timestamp) < CACHE_TIME) {
                renderCrossingsData(parsed.data);
                return;
            }
        } catch (e) {}
    }

    $('#loading-spinner').show();
    TrafikverketAPI.getRailCrossings().then(data => {
        if (data && data.RESPONSE.RESULT[0].RailCrossing) {
            const crossings = data.RESPONSE.RESULT[0].RailCrossing;
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: crossings })); } catch (e) {}
            renderCrossingsData(crossings);
        }
        $('#loading-spinner').hide();
    });
}

function renderCrossingsData(crossings) {
    crossings.forEach(rc => {
        const latLng = parseWGS84(rc.Geometry.WGS84);
        if (!latLng) return;
        const name = rc.RoadName || `Korsning ${rc.LevelCrossingId}`;
        const tracks = rc.NumberOfTracks ? `${rc.NumberOfTracks} spår` : "";
        
        const marker = L.circleMarker(latLng, {
            renderer: myRenderer, radius: 4, color: '#fff', weight: 1, fillColor: '#333', fillOpacity: 0.9
        });
        marker.bindPopup(`<div style="text-align:center;font-size:12px;"><strong>${name}</strong><br><span style="color:#666;">ID: ${rc.LevelCrossingId}</span><br>${tracks}</div>`)
              .addTo(crossingsLayer);
    });
    map.addLayer(crossingsLayer);
    crossingsLoaded = true;
}

function parseWGS84(wgs84) {
    if (!wgs84) return null;
    const matches = wgs84.match(/-?\d+(\.\d+)?/g);
    if (!matches || matches.length < 2) return null;
    return [parseFloat(matches[1]), parseFloat(matches[0])];
}

function getDiffMinutes(advertised, actual) {
    if (!advertised || !actual) return 0;
    const adv = new Date(advertised);
    const act = new Date(actual);
    return Math.round((act - adv) / 60000);
}

function getStationName(signature) {
    if (!signature) return "-";
    return stationNames[signature] || signature; 
}

function formatTime(dateString) {
    if (!dateString) return "";
    return new Date(dateString).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function updateProductDropdown() {
    if (!productSelect) return;
    const currentVal = productSelect.value;
    const sorted = Array.from(availableProducts).sort();
    productSelect.innerHTML = '<option value="all">Alla tågtyper</option>';
    sorted.forEach(prod => {
        if (!prod) return;
        const option = document.createElement('option');
        option.value = prod;
        option.textContent = prod;
        productSelect.appendChild(option);
    });
    if (sorted.includes(currentVal)) productSelect.value = currentVal;
    else productSelect.value = 'all';
}

function generatePopupHtml(id, info, speed, nextInfo) {
    const trainLabel = `Tåg ${id}`;
    const valOtn = info.otn || id;
    const destLabel = info.dest ? `TILL ${getStationName(info.dest)}` : ""; 
    const valProduct = info.product || "-";
    const valOperator = info.operator || "-";
    const valLoc = getStationName(info.location);
    const valSpeed = speed ? `${speed} km/h` : "0 km/h";
    
    let nextStationHtml = `<span style="color:#999;font-style:italic;font-size:11px;">Klicka för info...</span>`;
    
    if (nextInfo === "Laddar...") {
        nextStationHtml = `<span style="color:#999;font-style:italic;font-size:11px;">Laddar...</span>`;
    } else if (nextInfo && typeof nextInfo === 'object') {
        if (nextInfo.name === "Slutstation" || nextInfo.name === "-") {
            nextStationHtml = `<span>${nextInfo.name}</span>`;
        } else {
            const trackStr = nextInfo.track ? `(Spår ${nextInfo.track})` : "";
            let timeStr = "";
            let timeLabel = "";
            if (nextInfo.arr) {
                timeLabel = "Ank";
                timeStr = formatTime(nextInfo.arr);
                if (nextInfo.arrEst && nextInfo.arrEst !== nextInfo.arr) timeStr = `<s>${timeStr}</s> <strong style="color:#dc3545">${formatTime(nextInfo.arrEst)}</strong>`;
            } else if (nextInfo.dep) {
                timeLabel = "Avg";
                timeStr = formatTime(nextInfo.dep);
                if (nextInfo.depEst && nextInfo.depEst !== nextInfo.dep) timeStr = `<s>${timeStr}</s> <strong style="color:#dc3545">${formatTime(nextInfo.depEst)}</strong>`;
            }
            nextStationHtml = `<div style="font-weight:600;color:#4da6ff;">${nextInfo.name} ${trackStr}</div><div style="font-size:11px;">${timeLabel} ${timeStr}</div>`;
        }
    } else if (typeof nextInfo === 'string') {
        nextStationHtml = `<span style="color:#999;">${nextInfo}</span>`;
    }

    let statusClass = "status-unknown";
    let statusText = "Ingen tid";
    if (info.hasInfo) {
        if (info.diff > 2) { statusClass = "status-delayed"; statusText = `+${info.diff} min`; }
        else if (info.diff < 0) { statusClass = "status-early"; statusText = `${info.diff} min`; }
        else { statusClass = "status-ontime"; statusText = "I tid"; }
    } else if (info.isLoading) { statusText = "Laddar..."; }

    return `
        <div class="train-popup">
            <div class="popup-header">
                <div class="popup-title-group"><span class="popup-train-id">${trainLabel}</span><span class="popup-dest">${destLabel}</span></div>
                <div class="status-badge ${statusClass}">${statusText}</div>
            </div>
            <div class="popup-body">
                <div class="info-row"><span class="info-label">OTN/Rst</span><span class="info-value">${valOtn}</span></div>
                <div class="info-row"><span class="info-label">Produkt</span><span class="info-value">${valProduct}</span></div>
                <div class="info-row"><span class="info-label">Operatör</span><span class="info-value">${valOperator}</span></div>
                <div class="info-row"><span class="info-label">Senast</span><span class="info-value">${valLoc}</span></div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #eee;">
                    <div class="info-label" style="margin-bottom:2px;">NÄSTA UPPEHÅLL</div>
                    <div style="text-align:right;">${nextStationHtml}</div>
                </div>
                <div class="info-row" style="margin-top:10px;"><span class="info-label">Hastighet</span><span class="info-value">${valSpeed}</span></div>
                <a href="../train.html?train=${id}" class="popup-btn">Visa tidtabell</a>
                <a href="/taglagen/train.html?train=${id}" class="popup-btn" style="background-color:#6c757d;margin-top:5px;">Visa tågläge</a>
            </div>
        </div>
    `;
}

// --- INIT ---
function fetchStations() {
    TrafikverketAPI.getAllStations().then(data => {
        if (!data || !data.RESPONSE.RESULT[0].TrainStation) return;
        data.RESPONSE.RESULT[0].TrainStation.forEach(st => {
            stationNames[st.LocationSignature] = st.AdvertisedLocationName;
        });
    });
}

function updateTrainMetadata() {
    TrafikverketAPI.getActiveTrainData().then(data => {
        if (!data || !data.RESPONSE.RESULT[0].TrainAnnouncement) return;
        const announcements = data.RESPONSE.RESULT[0].TrainAnnouncement;
        let newProductsFound = false;
        announcements.forEach(ann => {
            const id = ann.AdvertisedTrainIdent;
            let existing = trainInfoCache[id] || { operator: "", product: "", dest: "", location: "", otn: "", diff: 0, hasInfo: false, timestamp: 0 };
            const eventTime = new Date(ann.TimeAtLocation).getTime();

            if (ann.TechnicalTrainIdent) existing.otn = ann.TechnicalTrainIdent;
            const op = ann.Operator || ann.InformationOwner;
            if (!existing.operator && op) existing.operator = op;

            let prod = "";
            if (ann.ProductInformation && ann.ProductInformation.length > 0) prod = ann.ProductInformation[0].Description;
            if (!prod && existing.operator) {
                const opLow = existing.operator.toLowerCase();
                if (opLow.includes('cargo') || opLow.includes('gods') || opLow.includes('rail')) prod = "Godståg";
            }
            if (!prod) prod = "Övriga";
            existing.product = prod;
            if (prod && !availableProducts.has(prod)) { availableProducts.add(prod); newProductsFound = true; }
            if (!existing.dest && ann.ToLocation) existing.dest = ann.ToLocation[0].LocationName;

            if (eventTime >= existing.timestamp) {
                existing.timestamp = eventTime;
                existing.location = ann.LocationSignature;
                if (ann.TechnicalTrainIdent) existing.otn = ann.TechnicalTrainIdent;
                if (ann.AdvertisedTimeAtLocation) {
                    existing.diff = getDiffMinutes(ann.AdvertisedTimeAtLocation, ann.TimeAtLocation);
                    existing.hasInfo = true;
                }
            }
            trainInfoCache[id] = existing;
        });
        if (newProductsFound) updateProductDropdown();
    });
}

function updateCacheFromAnn(id, ann) {
    let existing = trainInfoCache[id] || { operator: "", product: "Övriga", dest: "", location: "", otn: "", diff: 0, hasInfo: false, timestamp: 0 };
    if (ann.TechnicalTrainIdent) existing.otn = ann.TechnicalTrainIdent;
    existing.operator = ann.Operator || ann.InformationOwner || existing.operator;
    if (ann.ProductInformation) existing.product = ann.ProductInformation[0].Description;
    else if (existing.product === "Övriga" && existing.operator) {
         const opLow = existing.operator.toLowerCase();
         if (opLow.includes('cargo') || opLow.includes('gods')) existing.product = "Godståg";
    }
    if (ann.ToLocation) existing.dest = ann.ToLocation[0].LocationName;
    if (ann.LocationSignature) existing.location = ann.LocationSignature;
    if (ann.TimeAtLocation && ann.AdvertisedTimeAtLocation) {
        existing.diff = getDiffMinutes(ann.AdvertisedTimeAtLocation, ann.TimeAtLocation);
        existing.hasInfo = true;
    }
    existing.isLoading = false;
    trainInfoCache[id] = existing;
}

function updateMap() {
    $('#loading-spinner').show();
    TrafikverketAPI.getAllPositions().then(data => {
        if (!data || !data.RESPONSE.RESULT[0].TrainPosition) return;
        const positions = data.RESPONSE.RESULT[0].TrainPosition;
        const currentActiveIds = new Set(); 
        let visibleCount = 0;

        positions.forEach(pos => {
            const id = pos.Train.AdvertisedTrainNumber;
            const info = trainInfoCache[id] || { operator: '', product: 'Övriga', diff: 0, dest: '', location: '', otn: '', hasInfo: false };

            if (currentFilter !== 'all' && info.product !== currentFilter) {
                if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
                return;
            }

            visibleCount++;
            currentActiveIds.add(id);
            const latLng = parseWGS84(pos.Position.WGS84);
            if (!latLng || isNaN(latLng[0]) || isNaN(latLng[1])) return;
            if (latLng[0] < 50) return; 

            // Ikon
            let letter = "?";
            if (info.product && info.product !== "Övriga") letter = info.product.charAt(0).toUpperCase();
            else if (info.operator) letter = info.operator.charAt(0).toUpperCase();

            let markerClass = "marker-unknown";
            if (info.hasInfo) {
                if (info.diff > 2) markerClass = "marker-delayed";
                else markerClass = "marker-ontime";
            }

            let isHighlighted = false;
            if (searchTrainId && String(id) === String(searchTrainId)) {
                 markerClass += " marker-highlighted";
                 isHighlighted = true;
            }

            const bearing = pos.Bearing || 0;
            const iconHtml = `<span class="icon-text">${letter}</span><div class="direction-wrapper" style="transform: rotate(${bearing}deg);"><div class="arrow-tip"></div></div>`;
            const iconSize = isHighlighted ? [44, 44] : [30, 30]; // NY STORLEK HÄR
            const iconAnchor = isHighlighted ? [22, 22] : [15, 15]; // MITTEN

            const icon = L.divIcon({
                className: `train-marker-icon ${markerClass}`,
                html: iconHtml, 
                iconSize: iconSize,
                iconAnchor: iconAnchor
            });

            if (markers[id]) {
                markers[id].setLatLng(latLng);
                markers[id].setIcon(icon); 
            } else {
                const marker = L.marker(latLng, { icon: icon }).addTo(map);
                
                marker.on('click', function() {
                    let currentNext = "Laddar..."; 
                    marker.setPopupContent(generatePopupHtml(id, trainInfoCache[id] || {}, pos.Speed, currentNext));

                    const p1 = TrafikverketAPI.getSpecificTrain(id).then(trainData => {
                        if (trainData && trainData.RESPONSE.RESULT[0].TrainAnnouncement) {
                            updateCacheFromAnn(id, trainData.RESPONSE.RESULT[0].TrainAnnouncement[0]);
                        }
                    });

                    const p2 = TrafikverketAPI.getNextStation(id).then(nextData => {
                        if (!nextData || !nextData.RESPONSE.RESULT[0].TrainAnnouncement) return null;
                        const upcoming = nextData.RESPONSE.RESULT[0].TrainAnnouncement;
                        if (upcoming.length === 0) return { name: "Slutstation" };
                        const currentLoc = trainInfoCache[id] ? trainInfoCache[id].location : "";
                        let targetStationSig = upcoming[0].LocationSignature;
                        if (targetStationSig === currentLoc) {
                            if (upcoming.length > 1) targetStationSig = upcoming[1].LocationSignature;
                            else return { name: "Vid station" };
                        }
                        let nextObj = { name: getStationName(targetStationSig), track: null, arr: null, dep: null, arrEst: null, depEst: null };
                        const targetRow = upcoming.find(u => u.LocationSignature === targetStationSig);
                        if (targetRow) {
                            if (targetRow.ActivityType === "Ankomst") { nextObj.arr = targetRow.AdvertisedTimeAtLocation; nextObj.arrEst = targetRow.EstimatedTimeAtLocation; }
                            else { nextObj.dep = targetRow.AdvertisedTimeAtLocation; nextObj.depEst = targetRow.EstimatedTimeAtLocation; }
                            if (targetRow.TrackAtLocation) nextObj.track = targetRow.TrackAtLocation;
                        }
                        return nextObj;
                    });

                    Promise.all([p1, p2]).then(results => {
                        const nextInfo = results[1];
                        marker.setPopupContent(generatePopupHtml(id, trainInfoCache[id], pos.Speed, nextInfo));
                    });
                });

                marker.bindPopup(generatePopupHtml(id, info, pos.Speed, null));
                markers[id] = marker;
            }

            if (searchTrainId && String(id) === String(searchTrainId) && !hasFocusedSearch) {
                setTimeout(() => {
                    map.setView(latLng, 10);
                    markers[id].openPopup();
                    markers[id].fire('click'); 
                }, 1000);
                hasFocusedSearch = true;
            }
        });

        Object.keys(markers).forEach(id => {
            if (!currentActiveIds.has(id)) {
                map.removeLayer(markers[id]);
                delete markers[id];
            }
        });

        $('#train-count').text(`Visar ${visibleCount} tåg`);
        $('#loading-spinner').hide();

    }).catch(err => {
        console.error("Fel vid hämtning:", err);
    });
}

// --- INIT ---
fetchStations(); 
updateTrainMetadata();
setInterval(updateTrainMetadata, 30000); 
updateMap();
setInterval(updateMap, 5000);