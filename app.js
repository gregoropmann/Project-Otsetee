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
let notificationTimeout = null; 
let isSelling = false;
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
    "Mesi ja Mesindustooted": [
        "Õiemesi", "Kanarbikumesi", "Metsamesi", "Kärjemesi", "Taruvaik", "Suir", 
        "Mesilasvaha", "Sulatatud mesi maitsetaimedega", "Suhkrustunud mesi"
    ],
    "Kala ja Kalatooted": [
        "Suitsuangerjas", "Suitsulest", "Suitsurääbis", "Kuivatatud särg", "Värske koha", 
        "Värske ahven", "Marineeritud silmud", "Suitsulõhe", "Värske haug", "Kohafilee", 
        "Soolasiig", "Jõevähid"
    ],
    "Marjad": [
        "Metsmaasikad", "Aedmaasikad", "Vaarikad", "Mustikad", "Pohlad", "Jõhvikad", 
        "Murakad", "Mustad sõstrad", "Punased sõstrad", "Tikrid", "Kultuurmustikad", 
        "Arooniad", "Astelpajumarjad", "Ebaküdooniad"
    ],
    "Köögiviljad, Juurikad ja Seened": [
        "Värske kartul", "Meresoolakurk", "Hapukurk", "Küüslauk", "Mugulsibul", 
        "Peipsi sibul", "Porgand", "Hernekaunad", "Tilli-rohelise kimp", 
        "Värske kapsas", "Hapukapsas", "Punane peet", "Värske kurk", "Eesti tomat", 
        "Kirsstomatid", "Suvikõrvits", "Kõrvits", "Kukeseened", 
        "Puravakud", "Austerservikud", "Roheline sibul"
    ],
    "Puuviljad ja Marjaaiad": [
        "Kodumaised õunad", "Ploomid", "Kirsid", "Hapukirsid", "Pirnid", "Kreegid"
    ],
    "Piim, Juust ja Munad": [
        "Maamunad", "Vutimunad", "Lehma toorpiim", "Ahjujuust", "Sõir", "Maavõi", 
        "Hapukoor", "Kodujuust", "Kitsepiim", "Kohupiim"
    ],
    "Liha ja Lihatooted": [
        "Suitsusink", "Suitsuvorst", "Metssea vorst", "Põdraliha konserv", "Kodune sült", 
        "Grillvorstid", "Soolapekk", "Värske sealiha", "Lamba suitsuliha"
    ],
    "Küpsetised ja Omatoodang": [
        "Koduõlu", "Käsitööleib", "Peenleib", "Sibulapirukad", "Rabarberikook", 
        "Kodune kali", "Mahl (õuna/sõstra)", "Moos", "Ebaküdooniasiirup", 
        "Kuivatatud õunaviilud", "Karask", "Kohupiimakook"
    ],
    "Istikud, Taimed ja Lilled": [
        "Tomatiistikud", "Kurgiistikud", "Maasikataimed", "Maitsetaimede potid", 
        "Suvelillede amplid", "Lõikelilled", "Viljapuude istikud"
    ],
    "Saun, Käsitöö ja Kodu": [
        "Kase-saunavihad", "Tamme-saunavihad", "Käsitööseebid", "Saunamesi", 
        "Kootud villased sokid", "Käsitöövaibad", "Küttepuud (kotis)", "Kaminapuud (lepp)", 
        "Puidust köögiriistad", "Punutud korvid", "Vahaküünlad"
    ]
};

window.addEventListener('DOMContentLoaded', () => {
    renderQuickFilters(); 
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
                        localStorage.setItem('otset_selling', 'true');
                        localStorage.setItem('otset_verified', data.verified ? 'true' : 'false');
                        if (data.lat && data.lng) {
                            localStorage.setItem('otset_custom_lat', data.lat);
                            localStorage.setItem('otset_custom_lng', data.lng);
                        }
                        if (data.products) {
                            localStorage.setItem('otset_active_products', JSON.stringify(data.products));
                        }
                        if (data.payment_type) {
                            localStorage.setItem('otset_payment_type', data.payment_type);
                        }
                        localStorage.setItem('otset_is_permanent', data.is_permanent ? 'true' : 'false');
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

function renderQuickFilters() {
    const container = document.getElementById('quick-filters-container');
    if (!container) return;

    const popularProducts = ["Maasikad", "Herned", "Mesi", "Kala", "Munad", "Kartul", "Küüslauk", "Suitsusink", "Leib"];
    
    const emojis = {
        "Maasikad": "🍓", "Aedmaasikad": "🍓", "Metsmaasikad": "🍓",
        "Herned": "🫛", "Hernekaunad": "🫛",
        "Mesi": "🍯", "Õiemesi": "🍯", "Metsamesi": "🍯", "Kanarbikumesi": "🍯",
        "Kala": "🐟", "Suitsulõhe": "🐟", "Suitsuangerjas": "🐟", "Ahven": "🐟",
        "Munad": "🥚", "Maamunad": "🥚", "Vutimunad": "🥚",
        "Kartul": "🥔", "Värske kartul": "🥔",
        "Küüslauk": "🧄", "Mugulsibul": "🧅", "Peipsi sibul": "🧅",
        "Suitsusink": "🥩", "Liha": "🥩", "Värske kurk": "🥒", "Hapukurk": "🥒",
        "Eesti tomat": "🍅", "Kirsstomatid": "🍅", "Kukeseened": "🍄", "Seened": "🍄",
        "Käsitööleib": "🍞", "Leib": "🍞", "Õunad": "🍎", "Kodumaised õunad": "🍎", 
        "Piim": "🥛", "Juust": "🧀", "Kirsid": "🍒", "Vaarikad": "🍇", "Mustikad": "🫐"
    };

    let allItemsSet = new Set();
    for (const [category, items] of Object.entries(agriProducts)) {
        items.forEach(item => {
            allItemsSet.add(item);
        });
    }

    let finalSelection = [...popularProducts];

    allItemsSet.forEach(item => {
        const isAlreadyCovered = popularProducts.some(pop => item.toLowerCase().includes(pop.toLowerCase()));
        if (!isAlreadyCovered) {
            finalSelection.push(item);
        }
    });

    container.innerHTML = '';
    finalSelection.forEach(product => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        
        let emoji = '🍃';
        for (const [key, value] of Object.entries(emojis)) {
            if (product.toLowerCase().includes(key.toLowerCase())) {
                emoji = value;
                break;
            }
        }

        btn.innerHTML = `${emoji} ${product}`;
        btn.onclick = () => filterByProduct(product);
        container.appendChild(btn);
    });
}

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
    // --- LISATUD: Nime valiku ja kohandatud nime taastamine mälust ---
    const savedNameType = localStorage.getItem('otset_name_type') || 'google';
    const nameTypeRad = document.querySelector(`input[name="name_type"][value="${savedNameType}"]`);
    if (nameTypeRad) nameTypeRad.checked = true;

    const customNameInput = document.getElementById('merchant-custom-name');
    if (customNameInput) {
        customNameInput.value = localStorage.getItem('otset_custom_name') || '';
        customNameInput.style.display = savedNameType === 'custom' ? 'block' : 'none';
    }
    // -----------------------------------------------------------------
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

    const savedPayment = localStorage.getItem('otset_payment_type') || 'both';
    const paymentRad = document.querySelector(`input[name="payment_type"][value="${savedPayment}"]`);
    if (paymentRad) paymentRad.checked = true;

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
            let isItemOutOfStock = false;
            let savedPrice = "5.0";
            let savedUnit = "kg";

            const matchedProduct = activeProductsList.find(p => {
                const text = (typeof p === 'object') ? p.name : p;
                return text.startsWith(item);
            });

            if (matchedProduct) {
                isSelected = true;
                if (typeof matchedProduct === 'object') {
                    isItemOutOfStock = matchedProduct.available === false;
                }
                const textStr = (typeof matchedProduct === 'object') ? matchedProduct.name : matchedProduct;
                const parts = textStr.match(/\(([^)]+)\)/);
                if (parts && parts[1]) {
                    const priceUnit = parts[1].replace(' €', '').split('/');
                    if (priceUnit[0]) savedPrice = priceUnit[0].trim();
                    if (priceUnit[1]) savedUnit = priceUnit[1].trim();
                }
            }

            const card = document.createElement('div');
            card.className = `product-card ${isSelected ? 'selected' : ''} ${isItemOutOfStock ? 'out-of-stock-status' : ''}`;
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
                                <option value="kimp" ${savedUnit === 'kimp' ? 'selected' : ''}>€/kimp</option>
                                <option value="pudel" ${savedUnit === 'pudel' ? 'selected' : ''}>€/pdl</option>
                            </select>
                        </div>
                    </div>
                    <div class="stock-status-container" style="margin-top: 8px; display: ${isSelected ? 'flex' : 'none'};" id="stock-toggle-box-${globalId}">
                        <input type="checkbox" class="stock-toggle-checkbox" id="stock-check-${globalId}" ${isItemOutOfStock ? 'checked' : ''} onchange="toggleItemStock(${globalId})">
                        <label for="stock-check-${globalId}" style="color: #c62828; font-weight: 500;">Kaup hetkel otsas ❌</label>
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
    const stockBox = document.getElementById(`stock-toggle-box-${id}`);
    
    if (card.classList.contains('selected')) {
        card.classList.remove('selected');
        card.classList.remove('out-of-stock-status');
        document.getElementById(`stock-check-${id}`).checked = false;
        btn.innerText = "Vali toode";
        if (stockBox) stockBox.style.display = "none";
    } else {
        card.classList.add('selected');
        btn.innerText = "Valitud";
        if (stockBox) stockBox.style.display = "flex";
    }
}

window.toggleItemStock = function(id) {
    const card = document.getElementById(`prod-card-${id}`);
    const isChecked = document.getElementById(`stock-check-${id}`).checked;
    if (isChecked) {
        card.classList.add('out-of-stock-status');
    } else {
        card.classList.remove('out-of-stock-status');
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
        const isItemOutOfStock = document.getElementById(`stock-check-${id}`).checked;
        
        inventorySummary.push({
            name: `${name} (${price} €/${unit})`,
            available: !isItemOutOfStock
        });
    });

    const isPermanent = document.querySelector('input[name="sale_type"]:checked').value === 'permanent';
    const paymentType = document.querySelector('input[name="payment_type"]:checked').value;
    const phone = document.getElementById('merchant-phone').value;
    const hours = document.getElementById('merchant-hours').value;

    localStorage.setItem('otset_active_products', JSON.stringify(inventorySummary));
    localStorage.setItem('otset_is_permanent', isPermanent ? 'true' : 'false');
    localStorage.setItem('otset_payment_type', paymentType);
    localStorage.setItem('otset_phone', phone);
    localStorage.setItem('otset_hours', hours);

    // --- LISATUD: Loe raadionupu ja tekstivälja väärtused ---
    const nameType = document.querySelector('input[name="name_type"]:checked').value;
    const customName = document.getElementById('merchant-custom-name').value.trim();

    localStorage.setItem('otset_active_products', JSON.stringify(inventorySummary));
    localStorage.setItem('otset_is_permanent', isPermanent ? 'true' : 'false');
    localStorage.setItem('otset_payment_type', paymentType);
    localStorage.setItem('otset_phone', phone);
    localStorage.setItem('otset_hours', hours);
    
    // Salvestame valikud telefonisse mällu
    localStorage.setItem('otset_name_type', nameType);
    localStorage.setItem('otset_custom_name', customName);
    // -------------------------------------------------------

    switchView('map-view');

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

window.showNotification = function(message, duration = 3500, actions = null) {
    const container = document.getElementById('app-notification');
    const content = document.getElementById('notification-content');
    const btnArea = document.getElementById('notification-buttons');   
    if(!content || !container || !btnArea) return;

    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        notificationTimeout = null;
    }

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
        notificationTimeout = setTimeout(() => { 
            container.classList.remove('show'); 
            notificationTimeout = null;
        }, duration);
    }
}

window.handleSearch = function(event) {
    if (event.key === 'Enter' || event.keyCode === 13) {
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
            showNotification("Apple sisselogimine pole veel ühendatud.");
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
    localStorage.removeItem('otset_phone');
    localStorage.removeItem('otset_hours');
    localStorage.removeItem('otset_verified');
    localStorage.removeItem('otset_payment_type');
    localStorage.removeItem('otset_name_type');
    localStorage.removeItem('otset_custom_name');
    if (buyerCircle) { map.removeLayer(buyerCircle); buyerCircle = null; }
    if (geoWatchId) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    if (activeMarker) { map.removeLayer(activeMarker); activeMarker = null; }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
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

function buildProductsHTML(productsArray) {
    if (!productsArray || productsArray.length === 0) return 'Tooted puuduvad';
    return productsArray.map(p => {
        const name = (typeof p === 'object') ? p.name : p;
        const isAvailable = (typeof p === 'object') ? (p.available !== false) : true;
        
        if (!isAvailable) {
            return `<span style="text-decoration: line-through; color: #b71c1c; font-size:0.85rem;">• ${name} <b>(HETKEL OTSAS)</b></span>`;
        }
        return `• ${name}`;
    }).join('<br>');
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
                const prodHTML = buildProductsHTML(data.products);
                const gMapsLink = `https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`;
                
                const allOOS = data.products && data.products.length > 0 && data.products.every(p => typeof p === 'object' && p.available === false);
                
                let currentIcon = markerIcons.temporary;
                let typeLabel = "<span style='color:green;font-weight:bold;'>VÄLKMÜÜK (Live kohapeal)</span>";
                
                let verifiedBadge = "";
                if (data.verified === true) {
                    verifiedBadge = `<div style="background: #FFD700; color: #000; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 0.75rem; margin-bottom: 8px; text-align: center; border: 1px solid #DAA520;">🌟 Pikaajaline koostöö Otseteega</div>`;
                }

                if (data.is_permanent) {
                    if (allOOS) {
                        currentIcon = markerIcons.outofstock;
                        typeLabel = "<span style='color:red;font-weight:bold;'>PÜSIKOHT (Kogu kaup otsas!)</span>";
                    } else {
                        currentIcon = markerIcons.permanent;
                        typeLabel = "<span style='color:blue;font-weight:bold;'>PÜSIKOHT (Avatud / Saadaval)</span>";
                    }
                } else if (allOOS) {
                    currentIcon = markerIcons.outofstock;
                }

                const phoneHTML = data.contact_phone ? `<br><b>Telefon:</b> ${data.contact_phone}` : '';
                const hoursHTML = data.opening_hours ? `<br><b>Avatud:</b> ${data.opening_hours}` : '';
                
                let paymentLabel = "Sularaha ja Kaart 💵💳";
                if (data.payment_type === 'cash') paymentLabel = "Ainult sularaha 💵";
                if (data.payment_type === 'card') paymentLabel = "Ainult kaart <code>💳</code>";

                const popupContent = `
                    <div style="font-size:0.85rem; min-width:180px;">
                        ${verifiedBadge}
                        <b>${data.name}</b><br>
                        ${typeLabel}<br>
                        ${hoursHTML}
                        ${phoneHTML}<br>
                        <b>Maksmine:</b> ${paymentLabel}<br><br>
                        <span style="color:#222;font-weight:600;">Müüdavad tooted:</span><br>
                        ${prodHTML}<br>
                        <a href="${gMapsLink}" target="_blank" class="nav-link-btn" onclick="setTimeout(openBuyerFeedback, 3000)">Sõida siia (Navigatsioon)</a>
                        <button class="report-btn" onclick="reportMerchant('${id}', '${data.name}')" style="background:none; border:none; color:#D9534F; font-size:0.75rem; text-decoration:underline; cursor:pointer; margin-top:8px; width:100%; text-align:center;">
                            ⚠️ Kohapeal pole kedagi / Vale info? Teata siin
                        </button>
                    </div>
                `;
                
                if (merchantMarkers[id]) {
                    merchantMarkers[id].setLatLng([data.lat, data.lng]);
                    merchantMarkers[id].setIcon(currentIcon);
                    merchantMarkers[id].setPopupContent(popupContent);
                    merchantMarkers[id].options.merchantData = data; 
                } else {
                    merchantMarkers[id] = L.marker([data.lat, data.lng], { 
                        icon: currentIcon, 
                        draggable: false,
                        merchantData: data 
                    }).addTo(map).bindPopup(popupContent);
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

// ─── UUENDATUD FUNKTSIOON (FIX: Popup aken ei sulgu salvestamisel) ───
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
    const paymentType = localStorage.getItem('otset_payment_type') || 'both';
    const phone = localStorage.getItem('otset_phone') || '';
    const hours = localStorage.getItem('otset_hours') || '';
    
    if (accuracyCircle) {
        accuracyCircle.setLatLng([finalLat, finalLng]);
        accuracyCircle.setRadius(accuracy);
    } else {
        accuracyCircle = L.circle([finalLat, finalLng], {
            radius: accuracy, color: 'rgba(79, 119, 170, 0.5)', fillColor: '#4F77AA', fillOpacity: 0.15, weight: 1.5
        }).addTo(map);
    }

    if (!isRestoring) { map.setView([finalLat, finalLng], 15); }

    const rawProducts = localStorage.getItem('otset_active_products');
    const parsedProducts = rawProducts ? JSON.parse(rawProducts) : [];

    const allOOS = parsedProducts.length > 0 && parsedProducts.every(p => typeof p === 'object' && p.available === false);

    let myIcon = markerIcons.temporary;
    if(isPermanent) {
        myIcon = allOOS ? markerIcons.outofstock : markerIcons.permanent;
    } else if (allOOS) {
        myIcon = markerIcons.outofstock;
    }

    const prodListHTML = buildProductsHTML(parsedProducts);
    const gMapsLink = `https://www.google.com/maps/search/?api=1&query=${finalLat},${finalLng}`;
    const activeText = allOOS ? "<span style='color:red;'>AKTIIVNE (Kogu kaup otsas!)</span>" : "<span style='color:green;'>AKTIIVNE (Müük käib)</span>";
    
    let myVerifiedBadge = "";
    const isVerifiedInCloud = localStorage.getItem('otset_verified') === 'true';
    if (isVerifiedInCloud) {
        myVerifiedBadge = `<div style="background: #FFD700; color: #000; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 0.75rem; margin-bottom: 8px; text-align: center; border: 1px solid #DAA520;">🌟 Sinu pood on KINNITATUD</div>`;
    }

    let myPaymentLabel = "Sularaha ja Kaart 💵💳";
    if (paymentType === 'cash') myPaymentLabel = "Ainult sularaha 💵";
    if (paymentType === 'card') myPaymentLabel = "Ainult kaart <code>💳</code>";

    const popupContent = `
        <div style="max-height:240px; overflow-y:auto; font-size:0.85rem; min-width:180px;">
            ${myVerifiedBadge}
            <b>Sinu Müügikoht on ${activeText}</b><br>
            <b>Tüüp:</b> ${isPermanent ? 'Püsikoht' : 'Välkmüük'}<br>
            ${hours ? `<b>Avatud:</b> ${hours}<br>` : ''}
            <b>Maksmine:</b> ${myPaymentLabel}<br>
            <span style="color:#222;font-weight:600;">Sinu tooted:</span><br>
            ${prodListHTML}<br>
            <a href="${gMapsLink}" target="_blank" class="nav-link-btn">Testi navigatsiooni</a><br>
            <span style="color:var(--wheat-gold); font-weight:bold;">Vihje: Kui punkt on nihkes, lohista see näpuga õigesse teeotsa!</span>
        </div>
    `;

    if (activeMarker) {
        activeMarker.setLatLng([finalLat, finalLng]);
        activeMarker.setIcon(myIcon);
        activeMarker.setPopupContent(popupContent);
    } else {
        activeMarker = L.marker([finalLat, finalLng], { draggable: true, icon: myIcon }).addTo(map);
        activeMarker.bindPopup(popupContent);
        
        activeMarker.on('dragend', async function(event) {
            const marker = event.target;
            const currentPos = marker.getLatLng();
            if(accuracyCircle) accuracyCircle.setLatLng(currentPos);   
            localStorage.setItem('otset_custom_lat', currentPos.lat);
            localStorage.setItem('otset_custom_lng', currentPos.lng);
            if (auth.currentUser) {
        const merchantId = auth.currentUser.uid;
        const merchantNameFromGoogle = auth.currentUser.displayName || "Teeäärne Müüja";   
        
        // --- LISATUD: Dünaamiline nime valik vastavalt seadetele ---
        const savedNameType = localStorage.getItem('otset_name_type') || 'google';
        const savedCustomName = localStorage.getItem('otset_custom_name') || '';
        
        let finalMerchantName = merchantNameFromGoogle;
        if (savedNameType === 'custom' && savedCustomName !== '') {
            finalMerchantName = savedCustomName;
        }
        // -----------------------------------------------------------

        setDoc(doc(db, "active_merchants", merchantId), {
            name: finalMerchantName, // <--- Muudetud muutujaks finalMerchantName
            lat: finalLat,
            lng: finalLng,
            products: parsedProducts,
            is_permanent: isPermanent,
            is_out_of_stock: allOOS,
            contact_phone: phone,
            opening_hours: hours,
            verified: isVerifiedInCloud,
            payment_type: paymentType,
            updatedAt: new Date().toISOString()
        }).catch(err => console.error("Viga andmebaasi kirjutamisel:", err));
    }
        });
    }

    if (!isRestoring) {
        activeMarker.openPopup();
        showNotification("Müügikoht kaardil aktiivne!");
    }
    
    updateActionBarState();

    if (auth.currentUser) {
        const merchantId = auth.currentUser.uid;
        const merchantName = auth.currentUser.displayName || "Teeäärne Müüja";   
        setDoc(doc(db, "active_merchants", merchantId), {
            name: merchantName,
            lat: finalLat,
            lng: finalLng,
            products: parsedProducts,
            is_permanent: isPermanent,
            is_out_of_stock: allOOS,
            contact_phone: phone,
            opening_hours: hours,
            verified: isVerifiedInCloud,
            payment_type: paymentType,
            updatedAt: new Date().toISOString()
        }).catch(err => console.error("Viga andmebaasi kirjutamisel:", err));
    }

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
    
    if(stockBtn) stockBtn.style.display = "none";

    if (userRole === 'buyer') {
        actionBtn.disabled = false;
        actionBtn.innerText = "Minu Asukoht";
        actionBtn.className = "btn btn-success";
        if(editBtn) editBtn.style.display = "none";
        if(verifyBtn) verifyBtn.style.display = "none";
    } else {
        if (isSelling) {
            actionBtn.disabled = false;
            const isPerm = localStorage.getItem('otset_is_permanent') === 'true';
            actionBtn.innerText = isPerm ? "Kustuta Püsikoht" : "Lõpeta Müük";
            actionBtn.className = "btn btn-danger";
            if(editBtn) editBtn.style.display = "flex"; 
            
            const isVerified = localStorage.getItem('otset_verified') === 'true';
            if (verifyBtn) verifyBtn.style.display = isVerified ? "none" : "flex";
        } else {
            actionBtn.disabled = false;
            actionBtn.innerText = "Alusta Müüki";
            actionBtn.className = "btn btn-accent";
            if(editBtn) editBtn.style.display = "none";
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
        localStorage.setItem('otset_selling', 'false');
        localStorage.removeItem('otset_custom_lat');
        localStorage.removeItem('otset_custom_lng');
        localStorage.removeItem('otset_active_products');
        localStorage.removeItem('otset_is_permanent');
        localStorage.removeItem('otset_payment_type');
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

window.askForSupportAndVerify = async function() {
    if (!auth.currentUser) return;
    
    showNotification(
        `<b>Kas oled Otset.ee abil kliente leidnud?</b><br><br>Toeta arendajat ühe kohviga BuyMeACoffee kaudu. Tänu sellele märgime Sinu poe kaardil kuldse märgiga <b>"Pikaajaline koostöö Otseteega"</b>!`,
        0,
        [
            {
                text: "🚀 Toeta ja saa märgis",
                className: "btn-accent",
                callback: async () => {
                    try {
                        localStorage.setItem('otset_verified', 'true');
                        
                        await updateDoc(doc(db, "active_merchants", auth.currentUser.uid), {
                            pending_verification: true,
                            verified: true
                        });
                        
                        const savedLat = localStorage.getItem('otset_custom_lat');
                        const savedLng = localStorage.getItem('otset_custom_lng');
                        if (savedLat && savedLng) {
                            updateLocationProcess(parseFloat(savedLat), parseFloat(savedLng), 10, true);
                        }

                        window.open(`https://buymeacoffee.com/gregoropmann`, '_blank');
                        showNotification("Suunasime Sind toetuslehele. Sinu punktile lisati kuldne märgis!");
                    } catch (e) {
                        console.error(e);
                    }
                }
            },
            { text: "Tühista", className: "btn-primary", callback: () => {} }
        ]
    );
}

window.openBuyerFeedback = function() {
    const modal = document.getElementById('buyer-feedback-modal');
    if (!modal) return;
    document.getElementById('feedback-step-1').style.display = 'block';
    document.getElementById('feedback-step-2').style.display = 'none';
    modal.style.display = 'flex';
}

window.closeBuyerFeedback = function() {
    const modal = document.getElementById('buyer-feedback-modal');
    if (modal) modal.style.display = 'none';
}

window.handleBuyerFeedback = function(helped) {
    if (helped) {
        document.getElementById('feedback-step-1').style.display = 'none';
        document.getElementById('feedback-step-2').style.display = 'block';
    } else {
        closeBuyerFeedback();
    }
}

window.filterByProduct = function(productName) {
    if (!navigator.geolocation) {
        showNotification("Sinu seade ei toeta GPS-teenuseid.");
        return;
    }

    showNotification("Arvutan lähimaid müügipunkte...");

    navigator.geolocation.getCurrentPosition((position) => {
        const buyerLat = position.coords.latitude;
        const buyerLng = position.coords.longitude;
        const buyerLatLng = L.latLng(buyerLat, buyerLng);

        let validShops = [];
        
        for (const [merchantId, marker] of Object.entries(merchantMarkers)) {
            if (!marker.options || !marker.options.merchantData) continue; 
            
            const data = marker.options.merchantData;
            if (!data.products) continue;
            
            const matchedProd = data.products.find(p => {
                const name = (typeof p === 'object') ? p.name : p;
                const available = (typeof p === 'object') ? p.available !== false : true;
                return name.toLowerCase().includes(productName.toLowerCase()) && available;
            });

            if (matchedProd) {
                const shopLatLng = L.latLng(data.lat, data.lng);
                const distanceInMeters = buyerLatLng.distanceTo(shopLatLng);
                
                let priceValue = 999.0; 
                const priceMatch = matchedProd.name.match(/\(([^)]+)\)/);
                if (priceMatch && priceMatch[1]) {
                    priceValue = parseFloat(priceMatch[1].replace(' €', '').split('/')[0]);
                }

                validShops.push({
                    id: merchantId,
                    marker: marker,
                    distance: distanceInMeters / 1000, 
                    price: priceValue,
                    productFullName: matchedProd.name,
                    shopName: data.name
                });
            }
        }

        if (validShops.length === 0) {
            showNotification(`Kahjuks toodet "${productName}" hetkel ühegi aktiivse müüja valikus pole.`);
            return;
        }

        validShops.sort((a, b) => a.distance - b.distance);
        const closestShop = validShops[0];
        const cheapestShop = [...validShops].sort((a, b) => a.price - b.price)[0];

        if (map) {
            map.setView(closestShop.marker.getLatLng(), 13);
            closestShop.marker.openPopup();
        }

        let msg = `Lähim <b>${productName}</b> on <b>${closestShop.distance.toFixed(1)} km</b> kaugusel (Hind: ${closestShop.price} €).`;
        if (cheapestShop.id !== closestShop.id && cheapestShop.price < closestShop.price) {
            msg += `<br>Soodsaim hind on natuke eemal: <b>${cheapestShop.price} €</b> (${cheapestShop.distance.toFixed(1)} km).`;
        }

        showNotification(msg, 5000);

    }, (err) => {
        showNotification("Asukoha määramine ebaõnnestus.");
    }, geoOptions);
};

let currentReportingMerchantId = null;
let currentReportingMerchantName = null;

window.reportMerchant = function(merchantId, merchantName) {
    currentReportingMerchantId = merchantId;
    currentReportingMerchantName = merchantName;
    
    const modal = document.getElementById('report-modal');
    const title = document.getElementById('report-modal-title');
    
    if (!modal) return;
    
    title.innerHTML = `Teata probleemist: <br><span style="color:#2C2A29; font-size:1rem;">${merchantName}</span>`;
    
    document.getElementById('report-reason').value = '';
    document.getElementById('report-contact').value = '';
    
    modal.style.display = 'flex';
};

window.closeReportModal = function() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'none';
};

window.addEventListener('DOMContentLoaded', () => {
    const reportSubmitBtn = document.getElementById('report-submit-btn');
    if (reportSubmitBtn) {
        reportSubmitBtn.addEventListener('click', async () => {
            const reason = document.getElementById('report-reason').value.trim();
            const contact = document.getElementById('report-contact').value.trim();
            
            if (!reason) {
                alert("Palun kirjuta lühidalt, mis on probleemiks!");
                return;
            }
            
            if (!db || !currentReportingMerchantId) return;
            
            try {
                const reportId = `${currentReportingMerchantId}_${Date.now()}`;
                
                await setDoc(doc(db, "reports", reportId), {
                    merchantId: currentReportingMerchantId,
                    merchantName: currentReportingMerchantName,
                    reason: reason,
                    reporterContact: contact || "Pole lisatud",
                    reporterTimestamp: new Date().toISOString(),
                    status: "pending"
                });
                
                closeReportModal();
                showNotification("Aitäh! Sinu selgitus edastati arendajale ülevaatamiseks.");
            } catch (e) {
                console.error(e);
                showNotification("Teate saatmine ebaõnnestus.");
            }
        });
    }
});

window.toggleShopNameField = function() {
    const type = document.querySelector('input[name="name_type"]:checked').value;
    const nameInput = document.getElementById('merchant-custom-name');
    if (!nameInput) return;
    
    if (type === 'custom') {
        nameInput.style.display = 'block';
    } else {
        nameInput.style.display = 'none';
    }
}
