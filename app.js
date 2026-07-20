import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
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

// --- PROFANITY DICTIONARY & AUTOMATED ENFORCEMENT ENGINE ---
// Add any words here that should trigger an immediate permanent account closure
const PROFANITY_LIST = ["roppus1", "roppus2", "badword1", "badword2"];

/**
 * Scans string for profanity. If found, logs violation details, permanently bans the user document,
 * erases active cloud shops, resets map markers, alerts the client, and forcefully signs them out.
 */
async function checkProfanityAndProcess(inputText, user) {
    if (!inputText || !user) return false;

    const lowerText = inputText.toLowerCase();
    let detectedWord = null;

    for (const word of PROFANITY_LIST) {
        if (lowerText.includes(word)) {
            detectedWord = word;
            break;
        }
    }

    if (detectedWord) {
        try {
            const timestamp = new Date().toISOString();

            // 1. Log violation to the database
            const logRef = doc(collection(db, "ban_logs"));
            await setDoc(logRef, {
                username: user.displayName || "Anonymous User",
                userId: user.uid,
                detectedProfanity: detectedWord,
                fullInputText: inputText,
                timestamp: timestamp
            });

            // 2. Permanently flag the user record as banned
            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                username: user.displayName || "Anonymous User",
                warnings: 0,
                isBanned: true
            }, { merge: true });

            // 3. Delete active cloud shop marker matching the user's uid
            const markerDocRef = doc(db, "active_merchants", user.uid);
            await deleteDoc(markerDocRef);

            // 4. Remove UI/Visual markers from active view context
            if (activeMarker) {
                if (map) map.removeLayer(activeMarker);
                activeMarker = null;
            }
            if (accuracyCircle) {
                if (map) map.removeLayer(accuracyCircle);
                accuracyCircle = null;
            }

            isSelling = false;
            localStorage.clear();

            // 5. Notify the offender and kick them out
            alert(`Sinu konto on jäädavalt suletud ropendamise tõttu: "${detectedWord}". Kui usud, et see on viga, võta ühendust toega.`);
            await signOut(auth);
            switchView("login-view");
            return true; 
        } catch (error) {
            console.error("Viga turvakontrolli käivitamisel:", error);
        }
    }
    return false;
}

// Ühine tooteemoji sõnastik - kasutab nii kiirfiltrid kui ka kaardimarkerid
const productEmojis = {
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

function getEmojiForProduct(name) {
    if (!name) return '🌾';
    for (const [key, value] of Object.entries(productEmojis)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return value;
    }
    return '🌾';
}

function getTopEmojis(products, max = 3) {
    if (!products || products.length === 0) return ['🌾'];
    const available = products.filter(p => (typeof p === 'object' ? p.available !== false : true));
    const list = available.length > 0 ? available : products;
    const emojis = list.map(p => getEmojiForProduct(typeof p === 'object' ? p.name : p));
    return [...new Set(emojis)].slice(0, max);
}

function createMarkerIcon(type, emojis) {
    const colors = {
        temporary: '#4CAF50',   
        permanent: '#4F77AA',   
        outofstock: '#9E9E9E'
    };

    const emojiBadges = emojis.map(e =>
        `<div style="width:26px;height:26px;background:#fff;border-radius:50%;
                display:flex;align-items:center;justify-content:center;font-size:15px;
                box-shadow:0 2px 4px rgba(0,0,0,0.25);">${e}</div>`
    ).join('');

    return L.divIcon({
        html: `
            <div style="position:relative;width:40px;height:58px;">
                <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);
                            display:flex;gap:2px;white-space:nowrap;">
                    ${emojiBadges}
                </div>
                <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%) rotate(-45deg);
                            width:26px;height:26px;background:${colors[type]};
                            border-radius:50% 50% 50% 0;box-shadow:0 3px 8px rgba(0,0,0,0.3);
                            border:2.5px solid #fff;"></div>
            </div>
        `,
        className: '',
        iconSize: [40, 58],
        iconAnchor: [20, 56],
        popupAnchor: [0, -56]
    });
}

const geoOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

function getPaymentLabel(paymentType) {
    const labels = { cash: "Sularaha 💵", card: "Kaardimakse 💳", transfer: "Pangaülekanne 📲🏦" };

    if (!paymentType || paymentType === 'all' || paymentType === 'both') {
        return "Sularaha, Kaart ja Ülekanne 💵💳📲";
    }

    const parts = paymentType.split('+').filter(p => labels[p]);
    if (parts.length === 0) return "Sularaha, Kaart ja Ülekanne 💵💳📲";
    if (parts.length === 3) return "Sularaha, Kaart ja Ülekanne 💵💳📲";

    return parts.map(p => labels[p]).join(' + ');
}

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
    onAuthStateChanged(auth, async (user) => {
        try {
            if (user) {
                // Real-time security verification against the banned directory
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists() && userDoc.data().isBanned === true) {
                    alert(`Sinu konto on jäädavalt suletud ropendamise tõttu.\nKui usud, et see on viga, võta ühendust toega.`);
                    localStorage.clear();
                    await signOut(auth);
                    switchView('login-view');
                    return;
                }

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
                    }).catch((err) => {
                        console.error("Viga andmete lugemisel või õigustes:", err);
                        renderCatalog();
                        updateActionBarState();
                        setTimeout(() => {
                            if (typeof initMap === 'function' && !map) initMap();
                        }, 200);
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
        } catch (authError) {
            console.error("Autentimise oleku viga:", authError);
            localStorage.clear();
            switchView('login-view');
            alert("Sisselogimisel tekkis tõrge. Palun veendu, et brauser lubab kolmanda osapoole küpsiseid (Cookies) ja proovi uuesti.");
        }
    });
});

function renderQuickFilters() {
    const container = document.getElementById('quick-filters-container');
    if (!container) return;

    const popularProducts = ["Maasikad", "Herned", "Mesi", "Kala", "Munad", "Kartul", "Küüslauk", "Suitsusink", "Leib"];

    let allItemsSet = new Set();
    for (const [category, items] of Object.entries(agriProducts)) {
        items.forEach(item => { allItemsSet.add(item); });
    }

    let finalSelection = [...popularProducts];
    allItemsSet.forEach(item => {
        const isAlreadyCovered = popularProducts.some(pop => item.toLowerCase().includes(pop.toLowerCase()));
        if (!isAlreadyCovered) finalSelection.push(item);
    });

    container.innerHTML = '';
    finalSelection.forEach(product => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        const emoji = getEmojiForProduct(product);
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

    const savedPayment = localStorage.getItem('otset_payment_type') || 'all';
    const hiddenPaymentInput = document.getElementById('hidden-payment-type');
    if (hiddenPaymentInput) {
        hiddenPaymentInput.value = savedPayment === 'both' ? 'all' : savedPayment;
    }

    const savedPaymentParts = (savedPayment === 'all' || savedPayment === 'both')
        ? ["cash", "card", "transfer"]
        : savedPayment.split('+');

    const paymentCheckboxes = document.querySelectorAll('input[name="payment_method"]');
    paymentCheckboxes.forEach(cb => {
        cb.checked = savedPaymentParts.includes(cb.value);
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
                            <input type="text" value="${savedPrice}" class="price-num-input" id="price-num-${globalId}" placeholder="nt. 5.0-10.0">
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

window.confirmProductsAndStartGeo = async function() {
    const user = auth.currentUser;
    if (!user) return;

    const selectedElements = document.querySelectorAll('.product-card.selected');
    if (selectedElements.length === 0) {
        alert("Palun vali vähemalt üks toode, mida müüa!");
        return;
    }

    // Capture context configurations for inspection
    const hours = document.getElementById('merchant-hours').value;
    const nameType = document.querySelector('input[name="name_type"]:checked').value;
    const customName = document.getElementById('merchant-custom-name').value.trim();

    // 1. Run dynamic text scanning checks over Merchant Name & Info input values
    if (nameType === 'custom') {
        const isNameViolated = await checkProfanityAndProcess(customName, user);
        if (isNameViolated) return; 
    }
    const isHoursViolated = await checkProfanityAndProcess(hours, user);
    if (isHoursViolated) return;

    let inventorySummary = [];
    for (let el of selectedElements) {
        const id = el.id.replace('prod-card-', '');
        const name = el.getAttribute('data-name');
        const price = document.getElementById(`price-num-${id}`).value;
        const unit = document.getElementById(`unit-${id}`).value;
        const isItemOutOfStock = document.getElementById(`stock-check-${id}`).checked;
        
        // 2. Scan raw numeric/custom text pricing formats for injection hazards
        const isPriceViolated = await checkProfanityAndProcess(price, user);
        if (isPriceViolated) return;

        inventorySummary.push({
            name: `${name} (${price} €/${unit})`,
            available: !isItemOutOfStock
        });
    }

    const isPermanent = document.querySelector('input[name="sale_type"]:checked').value === 'permanent';
    const hiddenPaymentInput = document.getElementById('hidden-payment-type');
    const paymentType = hiddenPaymentInput ? hiddenPaymentInput.value : 'all';
    const phone = document.getElementById('merchant-phone').value;

    localStorage.setItem('otset_active_products', JSON.stringify(inventorySummary));
    localStorage.setItem('otset_is_permanent', isPermanent ? 'true' : 'false');
    localStorage.setItem('otset_payment_type', paymentType);
    localStorage.setItem('otset_phone', phone);
    localStorage.setItem('otset_hours', hours);
    localStorage.setItem('otset_name_type', nameType);
    localStorage.setItem('otset_custom_name', customName);

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
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowSize: [41, 41],
                            className: 'preview-marker-icon'
                        });
                        previewMarker = L.marker([lat, lon], { icon: orangeIcon }).addTo(map);
                        const mapsLink = `http://maps.google.com/?q=${lat},${lon}`;
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
                                        callback: () => {
                                            if (previewMarker) {
                                                map.removeLayer(previewMarker);
                                                previewMarker = null;
                                            }
                                        }
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
            if (!map) {
                initMap();
            } else {
                map.invalidateSize();
            }
        }, 100);
    } else if (viewId === 'product-selection-view') {
        renderCatalog();
    }
}

window.handleLogin = async function(role, providerName) {
    userRole = role;
    localStorage.setItem('otset_role', role);
    try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Ensure user baseline context is mapped inside Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
            await setDoc(userDocRef, {
                username: user.displayName || "Anonymous User",
                warnings: 0,
                isBanned: false
            });
        } else if (userDoc.data().isBanned === true) {
            alert(`Sinu konto on jäädavalt suletud ropendamise tõttu.\nKui usud, et see on viga, võta ühendust toega.`);
            localStorage.clear();
            await signOut(auth);
            switchView('login-view');
            return;
        }
        
        switchView('map-view');
    } catch (error) {
        console.error("Viga sisselogimisel:", error);
        alert("Sisselogimine ebaõnnestus.");
    }
};

window.handleLogout = async function() {
    try {
        if (isSelling) {
            await stopGeoTracking();
        }
        await signOut(auth);
        localStorage.clear();
        switchView('login-view');
    } catch (error) {
        console.error("Viga väljalogimisel:", error);
    }
};

function setupPaymentCheckboxListeners() {
    const checkboxes = document.querySelectorAll('input[name="payment_method"]');
    checkboxes.forEach(cb => {
        cb.onchange = () => {
            let selected = [];
            document.querySelectorAll('input[name="payment_method"]').forEach(box => {
                if (box.checked) selected.push(box.value);
            });
            const order = ["cash", "card", "transfer"];
            selected.sort((a, b) => order.indexOf(a) - order.indexOf(b));
            const hiddenInput = document.getElementById('hidden-payment-type');
            if (hiddenInput) {
                if (selected.length === 3 || selected.length === 0) {
                    hiddenInput.value = "all";
                } else {
                    hiddenInput.value = selected.join("+");
                }
            }
        };
    });
}
