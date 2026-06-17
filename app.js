import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBo648Em9A94sabAg0M-MXAlFUbXGjUr-Y",
    authDomain: "otsetee-9e167.firebaseapp.com",
    projectId: "otsetee-9e167",
    storageBucket: "otsetee-9e167.firebasestorage.app",
    messagingSenderId: "221378870886",
    appId: "1:221378870886:web:e595d472deb904ef6437a7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

let map;
let activeMarker = null;
let accuracyCircle = null;
let previewMarker = null;
let buyerCircle = null;
let geoWatchId = null;
let isSelling = false;
let isOutOfStock = false; 
let userRole = 'buyer'; 
let merchantMarkers = {}; 

const markerIcons = {
    temporary: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    }),
    permanent: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    }),
    outofstock: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    })
};

const geoOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

const agriProducts = {
    "Mesi ja Mesindustooted": ["Õiemesi", "Kanarbikumesi", "Metsamesi", "Kärjemesi", "Taruvaik", "Suir"],
    "Kala ja Kalatooted": ["Suitsuangerjas", "Suitsulest", "Suitsurääbis", "Kuivatatud särg", "Värske koha", "Värske ahven", "Marineeritud silmud"],
    "Marjad": ["Metsmaasikad", "Aedmaasikad", "Vaarikad", "Mustikad", "Pohlad", "Jõhvikad", "Murakad", "Mustad sõstrad", "Punased sõstrad", "Tikrid"],
    "Köögiviljad ja Juurikad": ["Värske kartul", "Meresoolakurk", "Hapukurk", "Küüslauk", "Mugulsibul", "Peipsi sibul", "Porgand", "Pilvikud/Kukeseened", "Hernekaunad", "Tilli-rohelise kimp"],
    "Puuviljad ja Marjaaiad": ["Kodumaised õunad", "Ploomid", "Kirsid", "Hapukirsid", "Pirnid"],
    "Piim, Juust ja Munad": ["Maamunad", "Vutimunad", "Lehma toorpiim", "Ahjujuust", "Sõir", "Maavõi"],
    "Küpsetised ja Omatoodang": ["Koduõlu", "Käsitööleib", "Peenleib", "Sibulapirukad", "Rabarberikook"]
};

window.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            localStorage.setItem('otset_loggedin', 'true');
            userRole = localStorage.getItem('otset_role') || 'merchant';          
            switchView('map-view');
            if (userRole === 'merchant') {
                getDoc(doc(db, "active_merchants", user.uid)).then((docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        isSelling = true;
                        isOutOfStock = data.is_out_of_stock || false;
                        localStorage.setItem('otset_selling', 'true');
                        if (data.lat && data.lng) {
                            localStorage.setItem('otset_custom_lat', data.lat);
                            localStorage.setItem('otset_custom_lng', data.lng);
                        }
                        if (data.products) {
                            localStorage.setItem('otset_active_products', JSON.stringify(data.products));
                        }
                        localStorage.setItem('otset_is_permanent', data.is_permanent ? 'true' : 'false');
                        localStorage.setItem('otset_is_recommended', data.is_recommended ? 'true' : 'false');
                        localStorage.setItem('otset_phone', data.contact_phone || '');
                        localStorage.setItem('otset_hours', data.opening_hours || '');
                        renderCatalog(); 
                        updateActionBarState();
                        setupWatchPosition(true);
                    } else {
                        const wasSelling = localStorage.getItem('otset_selling') === 'true';
                        if (wasSelling) {
                            isSelling = true;
                            setupWatchPosition(true);
                        }
                        renderCatalog();
                        updateActionBarState();
                    }
                }).catch(() => {
                    renderCatalog();
                    updateActionBarState();
                });
            } else {
                updateActionBarState();
            }
        } else {
            const isBuyer = localStorage.getItem('otset_role') === 'buyer';
            if (isBuyer) {
                userRole = 'buyer';
                switchView('map-view');
                updateActionBarState();
            } else {
                switchView('login-view');
            }
        }
    });
});

window.toggleMetaFields = function() {
    const type = document.querySelector('input[name="sale_type"]:checked').value;
    const target = document.getElementById('permanent-only-fields');
    if (type === 'permanent') {
        target.style.display = 'flex';
    } else {
        target.style.display = 'none';
    }
}

function renderCatalog() {
    const isPerm = localStorage.getItem('otset_is_permanent') === 'true';
    if (isPerm) {
        const rad = document.querySelector('input[name="sale_type"][value="permanent"]');
        if(rad) rad.checked = true;
        document.getElementById('permanent-only-fields').style.display = 'flex';
    } else {
        const rad = document.querySelector('input[name="sale_type"][value="temporary"]');
        if(rad) rad.checked = true;
        document.getElementById('permanent-only-fields').style.display = 'none';
    }

    document.getElementById('merchant-phone').value = localStorage.getItem('otset_phone') || '';
    document.getElementById('merchant-hours').value = localStorage.getItem('otset_hours') || '';

    const container = document.getElementById('catalog-container');
    if (!container) return;
    container.innerHTML = '';
    let globalId = 0;

    const rawActive = localStorage.getItem('otset_active_products');
    const activeProductsList = rawActive ? JSON.parse(rawActive) : [];

    for (const [category, items] of Object.entries(agriProducts)) {
        const block = document.createElement('div');
        block.className = 'category-block';
        const title = document.createElement('div');
        title.className = 'category-name';
        title.innerText = category;
        block.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'products-grid';

        items.forEach(item => {
            globalId++;                    
            let isSelected = false;
            let savedPrice = "5.0";
            let savedUnit = "kg";

            const matchedProduct = activeProductsList.find(p => p.startsWith(item));
            if (matchedProduct) {
                isSelected = true;
                const parts = matchedProduct.match(/\(([^)]+)\)/);
                if (parts && parts[1]) {
                    const priceUnit = parts[1].replace(' €', '').split('/');
                    if (priceUnit[0]) savedPrice = priceUnit[0].trim();
                    if (priceUnit[1]) savedUnit = priceUnit[1].trim();
                }
            }

            const card = document.createElement('div');
            card.className = `product-card ${isSelected ? 'selected' : ''}`;
            card.id = `prod-card-${globalId}`;
            card.setAttribute('data-name', item);

            card.innerHTML = `
                <div class="product-info">
                    <div class="product-label">${item}</div>
                    <div class="price-input-group">
                        <div class="pricing-fields">
                            <input type="number" step="0.1" value="${savedPrice}" class="price-num-input" id="price-num-${globalId}">
                            <select class="unit-select" id="unit-${globalId}">
                                <option value="kg" ${savedUnit === 'kg' ? 'selected' : ''}>€/kg</option>
                                <option value="karp" ${savedUnit === 'karp' ? 'selected' : ''}>€/karp</option>
                                <option value="purk" ${savedUnit === 'purk' ? 'selected' : ''}>€/purk</option>
                                <option value="tükk" ${savedUnit === 'tükk' ? 'selected' : ''}>€/tk</option>
                                <option value="pudel" ${savedUnit === 'pudel' ? 'selected' : ''}>€/pdl</option>
                            </select>
                        </div>
                    </div>
                </div>
                <button class="select-toggle-btn" onclick="toggleProductSelect(${globalId})">${isSelected ? 'Valitud' : 'Vali toode'}</button>
            `;
            grid.appendChild(card);
        });
        block.appendChild(grid);
        container.appendChild(block);
    }
}

window.toggleProductSelect = function(id) {
    const card = document.getElementById(`prod-card-${id}`);
    const btn = card.querySelector('.select-toggle-btn');
    if (card.classList.contains('selected')) {
        card.classList.remove('selected');
        btn.innerText = "Vali toode";
    } else {
        card.classList.add('selected');
        btn.innerText = "Valitud";
    }
}

window.handleActionBarClick = function() {
    if (userRole === 'buyer') {
        findPassengerLocation();
    } else {
        if (isSelling) {
            stopGeoTracking();
        } else {
            switchView('product-selection-view');
        }
    }
}

function findPassengerLocation() {
    if (!navigator.geolocation) {
        showNotification("Sinu seade ei toeta GPS-teenuseid.");
        return;
    }
    showNotification("Tuvastan Sinu asukohta...");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            if (map) {
                map.setView([latitude, longitude], 14);
                if (buyerCircle) map.removeLayer(buyerCircle);               
                buyerCircle = L.circle([latitude, longitude], { radius: 40, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 0.4 }).addTo(map)
                    .bindPopup('Sinu asukoht').openPopup();
            }
        },
        (err) => { showNotification("Asukoha leidmine ebaõnnestus."); console.error(err); },
        geoOptions
    );
}

window.confirmProductsAndStartGeo = function() {
    const selectedElements = document.querySelectorAll('.product-card.selected');
    if (selectedElements.length === 0) {
        alert("Palun vali vähemalt üks toode, mida müüa!");
        return;
    }

    let inventorySummary = [];
    selectedElements.forEach(el => {
        const id = el.id.replace('prod-card-', '');
        const name = el.getAttribute('data-name');
        const price = document.getElementById(`price-num-${id}`).value;
        const unit = document.getElementById(`unit-${id}`).value;
        inventorySummary.push(`${name} (${price} €/${unit})`);
    });

    const isPermanent = document.querySelector('input[name="sale_type"]:checked').value === 'permanent';
    const phone = document.getElementById('merchant-phone').value;
    const hours = document.getElementById('merchant-hours').value;

    localStorage.setItem('otset_active_products', JSON.stringify(inventorySummary));
    localStorage.setItem('otset_is_permanent', isPermanent ? 'true' : 'false');
    localStorage.setItem('otset_phone', phone);
    localStorage.setItem('otset_hours', hours);

    switchView('map-view');
    if (isSelling) {
        const savedLat = localStorage.getItem('otset_custom_lat');
        const savedLng = localStorage.getItem('otset_custom_lng');
        if (savedLat && savedLng) {
            updateLocationProcess(parseFloat(savedLat), parseFloat(savedLng), 10, true);
            showNotification("Andmed pilves reaalajas uuendatud!");
        }
    } else {
        startGeoTracking(false);
    }
}

window.toggleStockState = function() {
    if (!auth.currentUser || !isSelling) return;
    isOutOfStock = !isOutOfStock;   
    const savedLat = localStorage.getItem('otset_custom_lat');
    const savedLng = localStorage.getItem('otset_custom_lng');
    
    updateDoc(doc(db, "active_merchants", auth.currentUser.uid), {
        is_out_of_stock: isOutOfStock
    }).then(() => {
        updateLocationProcess(parseFloat(savedLat), parseFloat(savedLng), 10, true);
        if (isOutOfStock) {
            showNotification("Märgitud: Kaup hetkel OTSAS. Marker muutus halliks.");
        } else {
            showNotification("Märgitud: Kaup jälle SAADAVAL!");
        }
    }).catch(e => console.error(e));
}

window.showNotification = function(message, duration = 3500, actions = null) {
    const container = document.getElementById('app-notification');
    const content = document.getElementById('notification-content');
    const btnArea = document.getElementById('notification-buttons');   
    if(!content || !container || !btnArea) return;
    content.innerHTML = message;
    btnArea.innerHTML = '';
    if (actions && actions.length > 0) {
        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = `notif-btn ${action.className || ''}`;
            btn.innerText = action.text;
            btn.onclick = () => {
                action.callback();
                container.classList.remove('show');
            };
            btnArea.appendChild(btn);
        });
    }
    container.classList.add('show');
    if (!actions || actions.length === 0) {
        setTimeout(() => { container.classList.remove('show'); }, duration);
    }
}

window.handleSearch = function(event) {
    if (event.key === 'Enter') {
        const query = document.getElementById('location-search').value;
        if (!query) return;
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Estonia')}&limit=1`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lon = parseFloat(data[0].lon);
                    const placeName = data[0].display_name.split(',')[0];
                    if (map) {
                        map.setView([lat, lon], 14);
                        if (previewMarker) map.removeLayer(previewMarker);
                        const orangeIcon = L.icon({
                            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
                            className: 'preview-marker-icon'
                        });
                        previewMarker = L.marker([lat, lon], { icon: orangeIcon }).addTo(map);
                        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
                        previewMarker.bindPopup(`
                            <b>${placeName}</b><br>
                            Koordinaadid: ${lat.toFixed(5)}, ${lon.toFixed(5)}<br>
                            <a href="${mapsLink}" target="_blank" class="nav-link-btn">Navigeeri siia</a>
                        `).openPopup();
                        if (userRole === 'merchant') {
                            showNotification(
                                `Leiti koht: <b>${placeName}</b>.<br>Kas soovid müügikoha siia teeotsa lukustada?`,
                                0,
                                [
                                    {
                                        text: "Jah, kinnita asukoht",
                                        className: "btn-accent",
                                        callback: () => {
                                            map.removeLayer(previewMarker);
                                            previewMarker = null;
                                            localStorage.setItem('otset_custom_lat', lat);
                                            localStorage.setItem('otset_custom_lng', lon);
                                            showNotification("Asukoht salvestatud.");
                                            if(isSelling) {
                                                updateLocationProcess(lat, lon, 10, true);
                                            }
                                        }
                                    },
                                    {
                                        text: "Tühista",
                                        className: "btn-primary",
                                        callback: () => { if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; } }
                                    }
                                ]
                            );
                        }
                    }
                } else {
                    showNotification("Asukohta ei leitud.");
                }
            })
            .catch(err => {
                console.error(err);
                showNotification("Otsingutõrge.");
            });
    }
}

window.switchView = function(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');   
    if (viewId === 'map-view') {
        setTimeout(() => {
            if (!map) { initMap(); } else { map.invalidateSize(); }
        }, 100);
    } else if (viewId === 'product-selection-view') {
        renderCatalog();
    }
}

window.handleLogin = async function(role, providerName) {
    userRole = role;
    localStorage.setItem('otset_role', role);
    if (role === 'merchant') {
        if (providerName === 'Google') {
            showNotification("Ühendun Google'iga...");
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error(error);
                showNotification("Sisselogimine ebaõnnestus: " + error.message);
            }
        } else if (providerName === 'Apple') {
            showNotification("Apple sisselogimine pole vielä ühendatud.");
        }
    } else {
        localStorage.setItem('otset_loggedin', 'true');
        switchView('map-view');
        updateActionBarState();
        showNotification("Sisenesid Ostjana.");
        findPassengerLocation();
    }
}

window.handleLogout = async function() {
    const isPerm = localStorage.getItem('otset_is_permanent') === 'true';
    localStorage.removeItem('otset_loggedin');
    localStorage.removeItem('otset_selling');
    localStorage.removeItem('otset_custom_lat');
    localStorage.removeItem('otset_custom_lng');
    localStorage.removeItem('otset_active_products');
    localStorage.removeItem('otset_is_permanent');
    localStorage.removeItem('otset_is_recommended');
    localStorage.removeItem('otset_phone');
    localStorage.removeItem('otset_hours');
    if (buyerCircle) { map.removeLayer(buyerCircle); buyerCircle = null; }
    if (geoWatchId) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    if (activeMarker) { map.removeLayer(activeMarker); activeMarker = null; }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    try {
        if (!isPerm && auth.currentUser) {
            await deleteDoc(doc(db, "active_merchants", auth.currentUser.uid));
        }
        await signOut(auth);
        if(isPerm) {
            showNotification("Välja logitud. Sinu PÜSIKOHT jäi autojuhtidele kaardile nähtavaks!");
        } else {
            showNotification("Välja logitud. Sinu asukohapunkt eemaldati kaardilt.");
        }
    } catch (error) {
        console.error("Viga väljalogimisel:", error);
    }
    switchView('login-view');
}

function initMap() {
    const savedLat = localStorage.getItem('otset_custom_lat');
    const savedLng = localStorage.getItem('otset_custom_lng');
    const centerPoint = (savedLat && savedLng) ? [parseFloat(savedLat), parseFloat(savedLng)] : [58.2522, 26.4719];
    map = L.map('map-container', { zoomControl: false }).setView(centerPoint, 12); 
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    onSnapshot(collection(db, "active_merchants"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            const data = change.doc.data();
            
            if (auth.currentUser && id === auth.currentUser.uid) return;
            
            if (change.type === "removed") {
                if (merchantMarkers[id]) {
                    map.removeLayer(merchantMarkers[id]);
                    delete merchantMarkers[id];
                }
            } else {
                const prodHTML = data.products ? data.products.map(p => `• ${p}`).join('<br>') : 'Tooted puuduvad';
                const gMapsLink = `https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`;
                let currentIcon = markerIcons.temporary;
                let typeLabel = "<span style='color:green;font-weight:bold;'>VÄLKMÜÜK (Kohapeal reaalajas)</span>";
                
                if (data.is_permanent) {
                    if (data.is_out_of_stock) {
                        currentIcon = markerIcons.outofstock;
                        typeLabel = "<span style='color:red;font-weight:bold;'>PÜSIKOHT (Kaup hetkel otsas!)</span>";
                    } else {
                        currentIcon = markerIcons.permanent;
                        typeLabel = "<span style='color:blue;font-weight:bold;'>PÜSIKOHT (Avatud / Saadaval)</span>";
                    }
                }

                // Kuldse märgise loogika teiste ostjate vaates
                let recommendedBadge = "";
                if (data.is_recommended) {
                    recommendedBadge = "<div style='background:#FFF9E6; border:1px solid #E5A93C; color:#B37D14; padding:5px; border-radius:6px; margin-bottom:8px; font-weight:bold; font-size:0.8rem; text-align:center;'>⭐ Pikaajaline koostöö Otseteega</div>";
                }

                const phoneHTML = data.contact_phone ? `<br><b>Telefon:</b> ${data.contact_phone}` : '';
                const hoursHTML = data.opening_hours ? `<br><b>Avatud:</b> ${data.opening_hours}` : '';
                
                const popupContent = `
                    <div style="font-size:0.85rem; min-width:180px;">
                        ${recommendedBadge}
                        <b>${data.name}</b><br>
                        ${typeLabel}<br>
                        ${hoursHTML}
                        ${phoneHTML}<br><br>
                        <span style="color:#222;font-weight:600;">Müüdavad tooted:</span><br>
                        ${prodHTML}<br>
                        <a href="${gMapsLink}" target="_blank" class="nav-link-btn">Sõida siia (Navigatsioon)</a>
                    </div>
                `;
                if (merchantMarkers[id]) {
                    merchantMarkers[id].setLatLng([data.lat, data.lng]);
                    merchantMarkers[id].setIcon(currentIcon);
                    merchantMarkers[id].setPopupContent(popupContent);
                } else {
                    merchantMarkers[id] = L.marker([data.lat, data.lng], { icon: currentIcon, draggable: false }).addTo(map)
                        .bindPopup(popupContent);
                }
            }
        });
    });
}

window.mapZoomIn = function() { if (map) map.zoomIn(); }
window.mapZoomOut = function() { if (map) map.zoomOut(); }

function startGeoTracking(isRestoring) {
    if (userRole === 'buyer') return; 
    const actionBtn = document.getElementById('action-btn');
    if (!navigator.geolocation) {
        showNotification("Sinu seade ei toeta GPS-teenuseid.");
        return;
    }
    actionBtn.innerText = "Otsib asukohta...";
    actionBtn.disabled = true;
    const savedLat = localStorage.getItem('otset_custom_lat');
    const savedLng = localStorage.getItem('otset_custom_lng');
    if (savedLat && savedLng) {
        updateLocationProcess(parseFloat(savedLat), parseFloat(savedLng), 10, isRestoring);
        setupWatchPosition(isRestoring);
        return;
    }
    setupWatchPosition(isRestoring);
}

function setupWatchPosition(isRestoring) {
    if (geoWatchId) return; 
    geoWatchId = navigator.geolocation.watchPosition(
        (position) => {
            let { latitude, longitude, accuracy } = position.coords;
            if (latitude > 59.0 && !localStorage.getItem('otset_custom_lat')) {
                showNotification(
                    "Süsteem tuvastas asukohaks Tallinna (võrgu IP-viga). Kas soovid kasutada kohalikku Nõo/Elva testasukohta?",
                    0,
                    [
                        { text: "Kasuta testasukohta", className: "btn-primary", callback: () => { updateLocationProcess(58.2522, 26.4719, 15, isRestoring); } },
                        { text: "Ei, jäta GPS", className: "btn-accent", callback: () => { updateLocationProcess(latitude, longitude, accuracy, isRestoring); } }
                    ]
                );
                return;
            }
            updateLocationProcess(latitude, longitude, accuracy, isRestoring);
        },
        (error) => {
            if (!localStorage.getItem('otset_custom_lat')) {
                isSelling = false;
                updateActionBarState();
                showNotification("GPS asukoha määramine ebaõnnestus.");
            }
            console.error(error);
        },
        geoOptions
    );
}

function updateLocationProcess(lat, lng, accuracy, isRestoring) {
    let finalLat = lat;
    let finalLng = lng;
    const savedLat = localStorage.getItem('otset_custom_lat');
    const savedLng = localStorage.getItem('otset_custom_lng');
    if (savedLat && savedLng) {
        finalLat = parseFloat(savedLat);
        finalLng = parseFloat(savedLng);
    } else {
        localStorage.setItem('otset_custom_lat', finalLat);
        localStorage.setItem('otset_custom_lng', finalLng);
    }
    const isPermanent = localStorage.getItem('otset_is_permanent') === 'true';
    const isRecommended = localStorage.getItem('otset_is_recommended') === 'true';
    const phone = localStorage.getItem('otset_phone') || '';
    const hours = localStorage.getItem('otset_hours') || '';
    
    if (activeMarker) map.removeLayer(activeMarker);
    if (accuracyCircle) map.removeLayer(accuracyCircle);
    if (!isRestoring) { map.setView([finalLat, finalLng], 15); }
    accuracyCircle = L.circle([finalLat, finalLng], {
        radius: accuracy, color: 'rgba(79, 119, 170, 0.5)', fillColor: '#4F77AA', fillOpacity: 0.15, weight: 1.5
    }).addTo(map);
    
    let myIcon = markerIcons.temporary;
    if(isPermanent) {
        myIcon = isOutOfStock ? markerIcons.outofstock : markerIcons.permanent;
    }
    activeMarker = L.marker([finalLat, finalLng], { draggable: true, icon: myIcon }).addTo(map);
    const rawProducts = localStorage.getItem('otset_active_products');
    const parsedProducts = rawProducts ? JSON.parse(rawProducts) : [];
    const prodListHTML = parsedProducts.map(p => `• ${p}`).join('<br>');
    const gMapsLink = `https://www.google.com/maps/search/?api=1&query=${finalLat},${finalLng}`;
    const activeText = isOutOfStock ? "<span style='color:red;'>AKTIIVNE (Kaup otsas!)</span>" : "<span style='color:green;'>AKTIIVNE (Müük käib)</span>";
    
    // Kuldne silt ka kasutajale endale tema punktile klikates
    let recommendedBadge = "";
    if (isRecommended) {
        recommendedBadge = "<div style='background:#FFF9E6; border:1px solid #E5A93C; color:#B37D14; padding:5px; border-radius:6px; margin-bottom:8px; font-weight:bold; font-size:0.8rem; text-align:center;'>⭐ Pikaajaline koostöö Otseteega</div>";
    }

    activeMarker.bindPopup(`
        <div style="max-height:220px; overflow-y:auto; font-size:0.85rem; min-width:180px;">
            ${recommendedBadge}
            <b>Sinu Müügikoht on ${activeText}</b><br>
            <b>Tüüp:</b> ${isPermanent ? 'Püsikoht' : 'Välkmüük'}<br>
            ${hours ? `<b>Avatud:</b> ${hours}<br>` : ''}
            <span style="color:#222;font-weight:600;">Sinu tooted:</span><br>
            ${prodListHTML}<br>
            <a href="${gMapsLink}" target="_blank" class="nav-link-btn">Testi navigatsiooni</a><br>
            <span style="color:var(--wheat-gold); font-weight:bold;">Vihje: Kui punkt on nihkes, lohista see näpuga õigesse teeotsa!</span>
        </div>
    `);
    if (!isRestoring) {
        activeMarker.openPopup();
        showNotification("Müügikoht kaardil aktiivne!");
    }
    if (auth.currentUser) {
        const merchantId = auth.currentUser.uid;
        const merchantName = auth.currentUser.displayName || "Teeäärne Müüja";   
        setDoc(doc(db, "active_merchants", merchantId), {
            name: merchantName,
            lat: finalLat,
            lng: finalLng,
            products: parsedProducts,
            is_permanent: isPermanent,
            is_out_of_stock: isOutOfStock,
            is_recommended: isRecommended,
            contact_phone: phone,
            opening_hours: hours,
            updatedAt: new Date().toISOString()
        }).catch(err => console.error("Viga andmebaasi kirjutamisel:", err));
    }

    activeMarker.on('dragend', async function(event) {
        const marker = event.target;
        const currentPos = marker.getLatLng();
        if(accuracyCircle) accuracyCircle.setLatLng(currentPos);   
        localStorage.setItem('otset_custom_lat', currentPos.lat);
        localStorage.setItem('otset_custom_lng', currentPos.lng);
        if (auth.currentUser) {
            try {
                await updateDoc(doc(db, "active_merchants", auth.currentUser.uid), {
                    lat: currentPos.lat,
                    lng: currentPos.lng,
                    updatedAt: new Date().toISOString()
                });
                showNotification("Asukoht täpsustatud!");
            } catch(err) {
                console.error(err);
            }
        }
    });
    isSelling = true;
    localStorage.setItem('otset_selling', 'true');
    updateActionBarState();
}

function updateActionBarState() {
    const actionBtn = document.getElementById('action-btn');
    const editBtn = document.getElementById('edit-products-btn');
    const stockBtn = document.getElementById('stock-btn');
    const verifyBtn = document.getElementById('verify-btn');
    
    if (!actionBtn) return;
    if (userRole === 'buyer') {
        actionBtn.disabled = false;
        actionBtn.innerText = "Minu Asukoht";
        actionBtn.className = "btn btn-success";
        if(editBtn) editBtn.style.display = "none";
        if(stockBtn) stockBtn.style.display = "none";
        if(verifyBtn) verifyBtn.style.display = "none";
    } else {
        if (isSelling) {
            actionBtn.disabled = false;
            const isPerm = localStorage.getItem('otset_is_permanent') === 'true';
            const isRecommended = localStorage.getItem('otset_is_recommended') === 'true';
            
            actionBtn.innerText = isPerm ? "Kustuta Püsikoht" : "Lõpeta Müük";
            actionBtn.className = "btn btn-danger";
            if(editBtn) editBtn.style.display = "flex"; 
            
            // Kui on püsikoht ja POLE veel soovitatud, näitame kuldset nuppu
            if (verifyBtn && isPerm && !isRecommended) {
                verifyBtn.style.display = "flex";
            } else if (verifyBtn) {
                verifyBtn.style.display = "none";
            }

            if(stockBtn && isPerm) {
                stockBtn.style.display = "flex";
                if (isOutOfStock) {
                    stockBtn.innerText = "Kaup SAADAVAL";
                    stockBtn.className = "btn btn-success";
                } else {
                    stockBtn.innerText = "Kaup OTSAS";
                    stockBtn.className = "btn btn-warning";
                }
            } else if (stockBtn) {
                stockBtn.style.display = "none";
            }
        } else {
            actionBtn.disabled = false;
            actionBtn.innerText = "Alusta Müüki";
            actionBtn.className = "btn btn-accent";
            if(editBtn) editBtn.style.display = "none";
            if(stockBtn) stockBtn.style.display = "none";
            if(verifyBtn) verifyBtn.style.display = "none";
        }
    }
}

function stopGeoTracking() {
    const isPerm = localStorage.getItem('otset_is_permanent') === 'true';   
    const confirmStop = () => {
        if (auth.currentUser) {
            deleteDoc(doc(db, "active_merchants", auth.currentUser.uid))
                .catch(err => console.error(err));
        }
        if (geoWatchId) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
        if (activeMarker) { map.removeLayer(activeMarker); activeMarker = null; }
        if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
        if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
        isSelling = false;
        isOutOfStock = false;
        localStorage.setItem('otset_selling', 'false');
        localStorage.removeItem('otset_custom_lat');
        localStorage.removeItem('otset_custom_lng');
        localStorage.removeItem('otset_active_products');
        localStorage.removeItem('otset_is_permanent');
        localStorage.removeItem('otset_is_recommended');
        localStorage.removeItem('otset_phone');
        localStorage.removeItem('otset_hours');
        updateActionBarState();
        showNotification("Müük lõpetatud ja punkt kaardilt eemaldatud.");
    };
    if (isPerm) {
        showNotification(
            "Kas soovid selle püsikoha kaardilt <b>täielikult kustutada</b>? (Kui soovid lihtsalt poest lahkuda, logi hoopis välja)",
            0,
            [
                { text: "Jah, kustuta kaardilt", className: "btn-danger", callback: confirmStop },
                { text: "Tühista", className: "btn-primary", callback: () => {} }
            ]
        );
    } else {
        confirmStop();
    }
}

// NIMELISE TOETUSSÜSTEEMI INTERFEIS
window.askForSupportAndVerify = async function() {
    if (!auth.currentUser) return;
    
    const merchantName = auth.currentUser.displayName || "Teeäärne Müüja";
    
    showNotification(
        `<b>Kas oled Otset.ee abil kliente leidnud?</b><br><br>Toeta arendajat ühe kohviga BuyMeACoffee kaudu. Tänu sellele märgime Sinu poe kaardil kuldse märgiga <b>"Pikaajaline koostöö Otseteega"</b>!`,
        0,
        [
            {
                text: "🚀 Toeta ja saa märgis",
                className: "btn-accent",
                callback: async () => {
                    try {
                        // Märgime andmebaasis, et taotlus on sees
                        await updateDoc(doc(db, "active_merchants", auth.currentUser.uid), {
                            pending_verification: true
                        });
                        
                        // Teeme nime URL-i jaoks turvaliseks
                        const encodedName = encodeURIComponent(merchantName);
                        
                        // Avame Buy Me a Coffee unikaalse lingiga, kus nimi on küljes
                        window.open(`https://buymeacoffee.com/gregoropmann?name=${encodedName}`, '_blank');
                        
                        showNotification("Suunasime Sind toetuslehele. Kui toetus on kohal, ilmub Sinu punktile kuldne märgis!");
                    } catch (e) {
                        console.error(e);
                    }
                }
            },
            {
                text: "Tühista",
                className: "btn-primary",
                callback: () => {}
            }
        ]
    );
}
