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
    setupPaymentCheckboxListeners();
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
                        
                        if (data.name_type) localStorage.setItem('otset_name_type', data.name_type);
                        if (data.custom_name) localStorage.setItem('otset_custom_name', data.custom_name);

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

// --- KORRIGEERITUD MÄRKERUUTUDE REAALAJALINE SALVESTAMINE ---
function setupPaymentCheckboxListeners() {
    const individualBoxes = document.querySelectorAll('input[name="payment_method"]');
    individualBoxes.forEach(cb => {
        cb.addEventListener('change', function() {
            let selected = [];
            document.querySelectorAll('input[name="payment_method"]:checked').forEach(box => {
                selected.push(box.value);
            });
            localStorage.setItem('otset_payment_type', selected.join(','));
        });
    });
}

function renderCatalog() {
    const savedNameType = localStorage.getItem('otset_name_type') || 'google';
    const nameTypeRad = document.querySelector(`input[name="name_type"][value="${savedNameType}"]`);
    if (nameTypeRad) nameTypeRad.checked = true;

    const customNameInput = document.getElementById('merchant-custom-name');
    if (customNameInput) {
        customNameInput.value = localStorage.getItem('otset_custom_name') || '';
        customNameInput.style.display = savedNameType === 'custom' ? 'block' : 'none';
    }

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

    // --- UUENDATUD MAKSEVIISIDE KUVAMISE LOOGIKA (MÜÜJA SEADETE AVAMISEL) ---
    const savedPaymentRaw = localStorage.getItem('otset_payment_type') || 'cash';
    let activePayments = [];
    if (savedPaymentRaw === 'all' || savedPaymentRaw === 'both') {
        activePayments = ['cash', 'card', 'transfer'];
    } else {
        activePayments = savedPaymentRaw.split(',').map(p => p.trim()).filter(p => p.length > 0);
    }

    const paymentCheckboxes = document.querySelectorAll('input[name="payment_method"]');
    paymentCheckboxes.forEach(cb => {
        cb.checked = activePayments.includes(cb.value);
    });

    setupPaymentCheckboxListeners();

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
                                <option value="tk" ${savedUnit === 'tk' || savedUnit === 'tükk' ? 'selected' : ''}>€/tk</option>
                                <option value="kimp" ${savedUnit === 'kimp' ? 'selected' : ''}>€/kimp</option>
                                <option value="pdl" ${savedUnit === 'pdl' || savedUnit === 'pudel' ? 'selected' : ''}>€/pdl</option>
                            </select>
                        </div>
                    </div>
                    <div class="stock-status-container" style="margin-top: 8px; display: ${isSelected ? 'flex' : 'none'};" id="stock-toggle-box-${globalId}">
                        <input type="checkbox" class="stock-toggle-checkbox" id="stock-check-${globalId}" ${isItemOutOfStock ? 'checked' : ''} onchange="toggleItemStock('${globalId}')">
                        <label for="stock-check-${globalId}" style="color: #c62828; font-weight: 500; cursor: pointer; user-select: none;">Kaup hetkel otsas ❌</label>
                    </div>
                </div>
                <button class="select-toggle-btn" onclick="toggleProductSelect('${globalId}')">${isSelected ? 'Valitud' : 'Vali toode'}</button>
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
    
    // KOGUME VALITUD CHECKBOXID JA SALVESTAME DATABASE-I JA LOCALSTORAGE-ISSE
    let selectedPayments = [];
    document.querySelectorAll('input[name="payment_method"]:checked').forEach(box => {
        selectedPayments.push(box.value);
    });

    if (selectedPayments.length === 0) {
        selectedPayments = ['cash']; // Vaikimisi vähemalt sularaha, kui mitte midagi pole valitud
    }
    const paymentTypeValue = selectedPayments.join(',');

    const phone = document.getElementById('merchant-phone').value;
    const hours = document.getElementById('merchant-hours').value;

    const nameType = document.querySelector('input[name="name_type"]:checked').value;
    const customName = document.getElementById('merchant-custom-name').value.trim();

    localStorage.setItem('otset_active_products', JSON.stringify(inventorySummary));
    localStorage.setItem('otset_is_permanent', isPermanent ? 'true' : 'false');
    localStorage.setItem('otset_payment_type', paymentTypeValue);
    localStorage.setItem('otset_phone', phone);
    localStorage.setItem('otset_hours', hours);
    localStorage.setItem('otset_name_type', nameType);
    localStorage.setItem('otset_custom_name', customName);

    switchView('map-view');

    // Kui müük on juba aktiivne, uuendame kohe andmeid Firestore andmebaasis
    const user = auth.currentUser;
    if (isSelling && user) {
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
                    if (map) {
                        map.setView([lat, lon], 14);
                        if (previewMarker) map.removeLayer(previewMarker);
                        
                        const orangeIcon = L.icon({
                            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                        });
                        previewMarker = L.marker([lat, lon], { icon: orangeIcon }).addTo(map);
                    }
                } else {
                    showNotification("Seda kohta Eestis ei leitud.");
                }
            })
            .catch(() => showNotification("Otsing tõrkus. Kontrolli ühendust."));
    }
}

// Funktsioon, mis saadab asukoha andmed ja uuendatud makseviisid otse Firebase'i
async function updateLocationProcess(lat, lng, accuracy, forceSilentUpdate = false) {
    const user = auth.currentUser;
    if (!user) return;

    const rawActive = localStorage.getItem('otset_active_products');
    const activeProductsList = rawActive ? JSON.parse(rawActive) : [];
    const isPermanent = localStorage.getItem('otset_is_permanent') === 'true';
    const paymentType = localStorage.getItem('otset_payment_type') || 'cash';
    const phone = localStorage.getItem('otset_phone') || '';
    const hours = localStorage.getItem('otset_hours') || '';
    const nameType = localStorage.getItem('otset_name_type') || 'google';
    const customName = localStorage.getItem('otset_custom_name') || '';

    const merchantData = {
        merchantId: user.uid,
        merchantName: user.displayName || "Müüja",
        name_type: nameType,
        custom_name: customName,
        lat: lat,
        lng: lng,
        accuracy: accuracy,
        products: activeProductsList,
        is_permanent: isPermanent,
        payment_type: paymentType, // SIIN SAADETAKSE ANDMEBAASI NT "cash,card" VÕI "cash,transfer" JNE
        contact_phone: phone,
        opening_hours: hours,
        timestamp: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, "active_merchants", user.uid), merchantData, { merge: true });
        if (!forceSilentUpdate) {
            showNotification("Sinu asukoht ja tooted on kaardil nähtavad! 🚀");
        }
    } catch (e) {
        console.error("Viga andmebaasi salvestamisel:", e);
    }
}

// Ülejäänud abifunktsioonid (navigatsioon, login jne)
window.switchView = function(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        if (viewId === 'map-view' && !map) {
            initMap();
        }
        if (viewId === 'product-selection-view') {
            renderCatalog();
        }
    }
}

function initMap() {
    map = L.map('map-container', { zoomControl: false }).setView([58.5953, 25.0136], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Kuulame andmebaasi uuendusi
    onSnapshot(collection(db, "active_merchants"), (snapshot) => {
        // Kustutame vanad markerid kaardilt
        Object.keys(merchantMarkers).forEach(id => {
            map.removeLayer(merchantMarkers[id]);
        });
        merchantMarkers = {};

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.lat || !data.lng) return;

            let icon = markerIcons.temporary;
            if (data.is_permanent) icon = markerIcons.permanent;

            const allOut = data.products && data.products.length > 0 && data.products.every(p => p.available === false);
            if (allOut) icon = markerIcons.outofstock;

            const titleName = data.name_type === 'custom' && data.custom_name ? data.custom_name : data.merchantName;

            let popupContent = `<b>${titleName}</b><br>`;
            if (data.contact_phone) popupContent += `📞 ${data.contact_phone}<br>`;
            if (data.opening_hours) popupContent += `🕒 ${data.opening_hours}<br>`;
            
            // Kuvame makseviisid ilusamini kaardil
            if (data.payment_type) {
                const methods = data.payment_type.split(',').map(m => {
                    if (m === 'cash') return 'Sularaha';
                    if (m === 'card') return 'Kaart';
                    if (m === 'transfer') return 'Ülekanne';
                    return m;
                });
                popupContent += `💳 Makse: ${methods.join(', ')}<br>`;
            }

            popupContent += `<br><b>Tooted:</b><ul>`;
            data.products.forEach(p => {
                popupContent += `<li>${p.name} ${p.available ? '' : '❌ (OTSAS)'}</li>`;
            });
            popupContent += `</ul>`;

            const m = L.marker([data.lat, data.lng], { icon: icon }).bindPopup(popupContent);
            m.addTo(map);
            merchantMarkers[doc.id] = m;
        });
    });
}

window.mapZoomIn = function() { if (map) map.zoomIn(); }
window.mapZoomOut = function() { if (map) map.zoomOut(); }

window.handleLogin = function(role, providerName) {
    localStorage.setItem('otset_role', role);
    userRole = role;
    if (role === 'buyer') {
        switchView('map-view');
        updateActionBarState();
        return;
    }
    signInWithPopup(auth, provider).catch(e => console.error(e));
}

window.handleLogout = function() {
    signOut(auth).then(() => {
        localStorage.clear();
        userRole = 'buyer';
        isSelling = false;
        switchView('login-view');
    });
}

function updateActionBarState() {
    const actionBtn = document.getElementById('action-btn');
    const editBtn = document.getElementById('edit-products-btn');
    if (!actionBtn) return;

    if (userRole === 'buyer') {
        actionBtn.innerText = "Tuvasta minu asukoht 📍";
        if (editBtn) editBtn.style.display = 'none';
    } else {
        if (isSelling) {
            actionBtn.innerText = "Lõpeta Müük 🛑";
            actionBtn.className = "btn btn-danger";
            if (editBtn) editBtn.style.display = 'block';
        } else {
            actionBtn.innerText = "Alusta Müüki 🚀";
            actionBtn.className = "btn btn-accent";
            if (editBtn) editBtn.style.display = 'none';
        }
    }
}

function startGeoTracking(silent = false) {
    if (!navigator.geolocation) {
        showNotification("GPS pole toetatud.");
        return;
    }
    isSelling = true;
    localStorage.setItem('otset_selling', 'true');
    updateActionBarState();
    setupWatchPosition(silent);
}

function stopGeoTracking() {
    isSelling = false;
    localStorage.setItem('otset_selling', 'false');
    updateActionBarState();
    if (geoWatchId) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
    }
    const user = auth.currentUser;
    if (user) {
        deleteDoc(doc(db, "active_merchants", user.uid)).then(() => {
            showNotification("Müük edukalt lõpetatud ja märk eemaldatud.");
        });
    }
}

function setupWatchPosition(silent) {
    if (geoWatchId) navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            localStorage.setItem('otset_custom_lat', latitude);
            localStorage.setItem('otset_custom_lng', longitude);
            updateLocationProcess(latitude, longitude, accuracy, silent);
        },
        (err) => console.error(err),
        geoOptions
    );
}

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
