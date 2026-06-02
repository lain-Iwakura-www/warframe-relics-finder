const SEARCH_URL = '/api/search';
const SETS_SEARCH_URL = '/api/search-sets';
const SETS_URL = '/api/sets';
const RELICS_URL = '/api/relics-for-part';
const RELIC_DETAILS_URL = '/api/relic-details';
const WISHLIST_KEY = 'warframeWishlist';

const searchInput = document.getElementById('searchInput');
const suggestionsList = document.getElementById('suggestions');
const resultsDiv = document.getElementById('results');
const wishlistItems = document.getElementById('wishlist-items');

let currentState = null;
const historyStack = [];

// ================== WISHLIST ==================
function loadWishlist() {
    try {
        const raw = JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
        return raw.map(item => {
            if (!item.type) return { type: 'part', name: item.name, obtained: item.obtained || false };
            return item;
        });
    } catch (e) { return []; }
}
function saveWishlist(list) { localStorage.setItem(WISHLIST_KEY, JSON.stringify(list)); }
let wishlist = loadWishlist();

function isInWishlist(partName) {
    return wishlist.some(item => item.type === 'part' && item.name === partName);
}
function isSetInWishlist(setName) {
    return wishlist.some(item => item.type === 'set' && item.name === setName);
}
function getPartObtained(partName) {
    const entry = wishlist.find(item => item.type === 'part' && item.name === partName);
    return entry ? entry.obtained : false;
}
function syncPartObtained(partName, obtained) {
    wishlist.forEach(item => {
        if (item.type === 'part' && item.name === partName) item.obtained = obtained;
        else if (item.type === 'set') item.parts.forEach(p => { if (p.name === partName) p.obtained = obtained; });
    });
}

function renderWishlist() {
    const openSets = new Set();
    document.querySelectorAll('.wishlist-set[open]').forEach(details => {
        const name = details.dataset.setName;
        if (name) openSets.add(name);
    });

    if (!wishlist.length) {
        wishlistItems.innerHTML = '<li class="empty">Nothing added yet.</li>';
        return;
    }
    wishlistItems.innerHTML = '';
    wishlist.forEach((item, index) => {
        if (item.type === 'part') {
            const li = document.createElement('li');
            li.className = 'wishlist-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.checked = item.obtained; checkbox.title = 'Owned';
            checkbox.addEventListener('change', () => {
                syncPartObtained(item.name, checkbox.checked);
                saveWishlist(wishlist);
                renderWishlist();
            });
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            if (item.obtained) nameSpan.classList.add('obtained');
            nameSpan.addEventListener('click', () => { searchInput.value = item.name; navigateTo({ type: 'part', name: item.name }); });
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn'; deleteBtn.innerHTML = '×'; deleteBtn.title = 'Remove';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                wishlist.splice(index, 1); saveWishlist(wishlist); renderWishlist();
                if (currentState?.type === 'part' && currentState.name === item.name) refreshCurrentPage();
            });
            li.appendChild(checkbox); li.appendChild(nameSpan); li.appendChild(deleteBtn);
            wishlistItems.appendChild(li);
        } else if (item.type === 'set') {
            const details = document.createElement('details');
            details.className = 'wishlist-set';
            details.dataset.setName = item.name;
            if (openSets.has(item.name)) details.setAttribute('open', '');

            const summary = document.createElement('summary');
            summary.innerHTML = `<span class="wishlist-set-name">📦 ${escapeHtml(item.name)}</span>`;
            const deleteSetBtn = document.createElement('button');
            deleteSetBtn.className = 'delete-btn'; deleteSetBtn.innerHTML = '×'; deleteSetBtn.title = 'Remove set';
            deleteSetBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                wishlist.splice(index, 1); saveWishlist(wishlist); renderWishlist();
                if (currentState?.type === 'set' && currentState.name === item.name) refreshCurrentPage();
            });
            const btnsWrapper = document.createElement('span');
            btnsWrapper.className = 'wishlist-set-btns';
            btnsWrapper.appendChild(deleteSetBtn);
            summary.appendChild(btnsWrapper);
            details.appendChild(summary);

            const partsList = document.createElement('ul');
            partsList.className = 'wishlist-set-parts';
            item.parts.forEach((part, partIndex) => {
                const partLi = document.createElement('li');
                partLi.className = 'wishlist-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox'; checkbox.checked = part.obtained; checkbox.title = 'Owned';
                checkbox.addEventListener('change', () => {
                    syncPartObtained(part.name, checkbox.checked);
                    saveWishlist(wishlist);
                    renderWishlist();
                });
                const nameSpan = document.createElement('span');
                nameSpan.textContent = part.name;
                if (part.obtained) nameSpan.classList.add('obtained');
                nameSpan.addEventListener('click', () => { searchInput.value = part.name; navigateTo({ type: 'part', name: part.name }); });
                partLi.appendChild(checkbox); partLi.appendChild(nameSpan);
                partsList.appendChild(partLi);
            });
            details.appendChild(partsList);
            wishlistItems.appendChild(details);
        }
    });

    // Кнопка "Find Best Relics"
    const btnLi = document.createElement('li');
    btnLi.className = 'wishlist-action';
    const btn = document.createElement('button');
    btn.id = 'findBestRelicsBtn';
    btn.textContent = '🔍 Find Best Relics';
    btn.addEventListener('click', findBestRelics);
    btnLi.appendChild(btn);
    wishlistItems.appendChild(btnLi);
}

function toggleWishlist(type, name, parts = null) {
    if (type === 'part') {
        const existing = wishlist.findIndex(item => item.type === 'part' && item.name === name);
        if (existing !== -1) wishlist.splice(existing, 1);
        else wishlist.push({ type: 'part', name, obtained: false });
    } else if (type === 'set') {
        const existing = wishlist.findIndex(item => item.type === 'set' && item.name === name);
        if (existing !== -1) wishlist.splice(existing, 1);
        else if (parts) {
            const partsArray = parts.map(p => ({ name: p.name, obtained: getPartObtained(p.name) }));
            wishlist.push({ type: 'set', name, parts: partsArray });
        }
    }
    saveWishlist(wishlist);
    renderWishlist();
    if (currentState) {
        if (currentState.type === 'set' && currentState.name === name) loadSetPage(name);
        else if (currentState.type === 'part' && currentState.name === name) loadRelics(name);
    }
}

// ================== FIND BEST RELICS ==================
async function findBestRelics() {
    const partNames = [];
    wishlist.forEach(item => {
        if (item.type === 'part' && !item.obtained) partNames.push(item.name);
        else if (item.type === 'set') item.parts.forEach(p => { if (!p.obtained) partNames.push(p.name); });
    });
    const uniqueParts = [...new Set(partNames)];
    if (!uniqueParts.length) {
        alert('All parts obtained! Nothing to search.');
        return;
    }

    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<p>Finding best relics...</p>';

    try {
        const resp = await fetch('/api/optimal-relics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts: uniqueParts })
        });
        if (!resp.ok) {
            resultsDiv.innerHTML = `<p class="error">Error ${resp.status}</p>`;
            return;
        }
        const data = await resp.json();
        if (!data.relics || data.relics.length === 0) {
            resultsDiv.innerHTML = '<p>No relics contain your missing parts.</p>';
            return;
        }
        renderBestRelics(data.relics);
    } catch (err) {
        console.error(err);
        resultsDiv.innerHTML = '<p class="error">Network error.</p>';
    }
}

function renderBestRelics(relics) {
    let html = '';
    if (historyStack.length > 0) {
        html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    }
    html += `<h2>🎯 Best Relics for Your Missing Parts</h2>`;
    html += `<div class="filter-row"><label><input type="checkbox" id="showAvailableOnlyBest"> Show available only</label></div>`;
    html += `<table id="bestRelicsTable"><thead><tr><th>Relic</th><th>Status</th><th>Missing Parts</th><th>Count</th></tr></thead><tbody>`;

    relics.forEach(r => {
        const vaultedClass = r.isVaulted ? 'vaulted' : 'not-vaulted';
        const vaultedText = r.isVaulted ? 'Vaulted' : 'Available';
        const rowClass = r.isVaulted ? 'vaulted-row' : 'available-row';
        const safeParts = r.desiredParts.map(escapeHtml).join(', ');
        html += `<tr class="${rowClass}">
            <td class="relic-name">${escapeHtml(r.relic)}</td>
            <td class="${vaultedClass}">${vaultedText}</td>
            <td>${safeParts}</td>
            <td>${r.desiredCount}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;

    const checkbox = document.getElementById('showAvailableOnlyBest');
    if (checkbox) {
        checkbox.addEventListener('change', function() {
            const show = this.checked;
            document.querySelectorAll('#bestRelicsTable tbody tr').forEach(row => {
                row.style.display = (show && row.classList.contains('vaulted-row')) ? 'none' : '';
            });
        });
    }

    document.querySelectorAll('.relic-name').forEach(td => {
        td.addEventListener('click', () => {
            const baseName = td.textContent.trim();
            navigateTo({ type: 'relic', name: baseName });
        });
    });
}

// ================== NAVIGATION ==================
function navigateTo(state, addToHistory = true) {
    if (addToHistory && currentState) historyStack.push(currentState);
    currentState = state;
    resultsDiv.style.display = 'block';
    if (state.type === 'set') loadSetPage(state.name);
    else if (state.type === 'part') loadRelics(state.name);
    else if (state.type === 'relic') loadRelicDetails(state.name);
}

function refreshCurrentPage() {
    if (!currentState) return;
    resultsDiv.style.display = 'block';
    if (currentState.type === 'set') loadSetPage(currentState.name);
    else if (currentState.type === 'part') loadRelics(currentState.name);
    else if (currentState.type === 'relic') loadRelicDetails(currentState.name);
}

function goBack() {
    if (historyStack.length === 0) return;
    const prevState = historyStack.pop();
    currentState = null;
    navigateTo(prevState, false);
}

// ================== SEARCH ==================
function debounce(fn, delay) { let timer; return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); }; }

async function fetchSuggestions(query) {
    const [pResp, sResp] = await Promise.allSettled([
        fetch(`${SEARCH_URL}?q=${encodeURIComponent(query)}`),
        fetch(`${SETS_SEARCH_URL}?q=${encodeURIComponent(query)}`)
    ]);
    let parts = [], sets = [];
    if (pResp.status === 'fulfilled' && pResp.value.ok) parts = (await pResp.value.json()).parts || [];
    if (sResp.status === 'fulfilled' && sResp.value.ok) sets = (await sResp.value.json()).sets || [];
    return { parts, sets };
}

function showSuggestions({ parts, sets }) {
    suggestionsList.innerHTML = '';
    const items = [];
    sets.forEach(s => items.push({ label: `📦 ${s}`, type: 'set', value: s }));
    parts.forEach(p => items.push({ label: p, type: 'part', value: p }));
    if (!items.length) { suggestionsList.classList.remove('visible'); return; }
    items.forEach(item => {
        const li = document.createElement('li'); li.textContent = item.label;
        li.addEventListener('click', () => { searchInput.value = item.value; hideSuggestions(); navigateTo({ type: item.type, name: item.value }); });
        suggestionsList.appendChild(li);
    });
    suggestionsList.classList.add('visible');
}
function hideSuggestions() { suggestionsList.classList.remove('visible'); }

// ================== SET PAGE ==================
async function loadSetPage(setName) {
    resultsDiv.innerHTML = '<p>Loading set...</p>';
    try {
        const resp = await fetch(`${SETS_URL}?name=${encodeURIComponent(setName)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">Set not found (error ${resp.status})</p>`; return; }
        const data = await resp.json();
        renderSetPage(data);
    } catch (err) { console.error(err); resultsDiv.innerHTML = '<p class="error">Loading error.</p>'; }
}

function renderSetPage(data) {
    const { setName, parts } = data;
    const setInWishlist = isSetInWishlist(setName);
    const btnText = setInWishlist ? '❌ Remove set' : '➕ Add set';
    const btnClass = setInWishlist ? 'wishlist-btn remove' : 'wishlist-btn';

    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    html += `<div class="set-info"><h2>📦 ${escapeHtml(setName)}</h2><button class="${btnClass}" id="toggleSetBtn">${btnText}</button></div>`;
    html += `<table class="set-table"><thead><tr><th>Part</th><th>Rarity</th><th>Relics</th><th>Ducats</th></tr></thead><tbody>`;
    parts.forEach(part => {
        html += `<tr><td><a class="part-link" data-part="${escapeHtml(part.name)}">${escapeHtml(part.name)}</a></td><td>${part.rarity}</td><td>${part.relicCount}</td><td>${part.ducats}</td></tr>`;
    });
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;

    document.getElementById('toggleSetBtn').addEventListener('click', () => toggleWishlist('set', setName, parts));
    document.querySelectorAll('.part-link[data-part]').forEach(link => {
        link.addEventListener('click', () => navigateTo({ type: 'part', name: link.dataset.part }));
    });
}

// ================== PART PAGE ==================
async function loadRelics(partName) {
    resultsDiv.innerHTML = '<p>Loading...</p>';
    try {
        const resp = await fetch(`${RELICS_URL}?part=${encodeURIComponent(partName)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">Error ${resp.status}</p>`; return; }
        const data = await resp.json();
        if (!data.relics || data.relics.length === 0) { resultsDiv.innerHTML = '<p>No relics found.</p>'; return; }
        renderRelicTable(data);
    } catch (err) { console.error(err); resultsDiv.innerHTML = '<p class="error">Loading error.</p>'; }
}

function renderRelicTable(data) {
    const uniqueRelics = []; const seenBaseNames = new Set();
    for (const relic of data.relics) {
        const baseName = relic.name.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '');
        if (seenBaseNames.has(baseName)) continue;
        seenBaseNames.add(baseName);
        uniqueRelics.push({ ...relic, name: baseName, fullName: relic.name });
    }
    const relics = uniqueRelics.sort((a, b) => {
        if (a.isVaulted !== b.isVaulted) return a.isVaulted ? 1 : -1;
        return a.name.localeCompare(b.name);
    });
    const rarity = data.rarity || 'Common';
    const chances = relics[0]?.dropChances || {};
    const ducats = data.ducats || 0;
    const inWishlist = isInWishlist(data.part);
    const btnText = inWishlist ? '❌ Remove from wishlist' : '➕ Add to wishlist';
    const btnClass = inWishlist ? 'wishlist-btn remove' : 'wishlist-btn';
    const setName = data.setName;

    let partDisplay;
    if (setName && data.part.startsWith(setName + ' ')) {
        const suffix = data.part.slice(setName.length);
        partDisplay = `<a class="set-link">${escapeHtml(setName)}</a>${escapeHtml(suffix)}`;
    } else {
        partDisplay = escapeHtml(data.part);
    }

    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    html += `<div class="part-info"><h2>${partDisplay}</h2><button class="${btnClass}">${btnText}</button></div>`;
    html += `<div class="rarity-info">
        <span>Rarity: <strong>${rarity}</strong></span>
        <span class="chances-summary">(Intact: ${chances.Intact} | Exceptional: ${chances.Exceptional} | Flawless: ${chances.Flawless} | Radiant: ${chances.Radiant})</span>
        <span class="ducats">| ${ducats} ducats</span>
        <span class="platinum-price">| platinum N/A</span>
    </div>`;
    html += `<div class="filter-row"><label><input type="checkbox" id="showAvailableOnly"> Show available only</label></div>`;
    html += `<table id="relicsTable"><thead><tr><th>Relic</th><th>Status</th></tr></thead><tbody>`;
    relics.forEach(relic => {
        const vaultedClass = relic.isVaulted ? 'vaulted' : 'not-vaulted';
        const vaultedText = relic.isVaulted ? 'Vaulted' : 'Available';
        const rowClass = relic.isVaulted ? 'vaulted-row' : 'available-row';
        html += `<tr class="${rowClass}"><td class="relic-name" data-full-name="${escapeHtml(relic.fullName)}">${relic.name}</td><td class="${vaultedClass}">${vaultedText}</td></tr>`;
    });
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;

    const wishlistBtn = resultsDiv.querySelector('.wishlist-btn');
    if (wishlistBtn) wishlistBtn.addEventListener('click', () => toggleWishlist('part', data.part));

    const showAvailableCheckbox = document.getElementById('showAvailableOnly');
    if (showAvailableCheckbox) {
        showAvailableCheckbox.addEventListener('change', function () {
            const show = this.checked;
            document.querySelectorAll('#relicsTable tbody tr').forEach(row => {
                row.style.display = (show && row.classList.contains('vaulted-row')) ? 'none' : '';
            });
        });
    }

    document.querySelectorAll('.relic-name').forEach(td => {
        td.addEventListener('click', () => {
            const fullName = td.dataset.fullName;
            navigateTo({ type: 'relic', name: fullName.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '') });
        });
    });

    const setLink = resultsDiv.querySelector('.set-link');
    if (setLink) setLink.addEventListener('click', () => navigateTo({ type: 'set', name: setName }));
}

// ================== RELIC PAGE ==================
async function loadRelicDetails(relicName) {
    const baseName = relicName.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '');
    resultsDiv.innerHTML = '<p>Loading...</p>';
    try {
        const resp = await fetch(`${RELIC_DETAILS_URL}?relic=${encodeURIComponent(baseName)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">Error ${resp.status}</p>`; return; }
        const data = await resp.json();
        renderRelicDetails(data);
    } catch (err) { console.error(err); resultsDiv.innerHTML = '<p class="error">Loading error.</p>'; }
}

function renderRelicDetails(data) {
    const { relicName, isVaulted, rewards } = data;
    const vaultedText = isVaulted ? 'Vaulted' : 'Available';
    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    html += `<div class="relic-info"><h2>${escapeHtml(relicName)}</h2><p>Status: <span class="${isVaulted ? 'vaulted' : 'not-vaulted'}">${vaultedText}</span></p></div>`;
    html += `<table class="rewards-table"><thead><tr><th>Reward</th><th>Rarity</th><th>Intact</th><th>Exceptional</th><th>Flawless</th><th>Radiant</th><th>Ducats</th><th></th></tr></thead><tbody>`;
    rewards.forEach(reward => {
        const chances = reward.dropChances;
        const inWishlist = isInWishlist(reward.partName);
        const btnText = inWishlist ? '❌ Remove' : '➕ Add to wishlist';
        html += `<tr>
            <td class="reward-part" data-part="${escapeHtml(reward.partName)}">${escapeHtml(reward.partName)}</td>
            <td>${reward.rarity}</td>
            <td>${chances.Intact}</td>
            <td>${chances.Exceptional}</td>
            <td>${chances.Flawless}</td>
            <td>${chances.Radiant}</td>
            <td>${reward.ducats}</td>
            <td><button class="wishlist-btn ${inWishlist ? 'remove' : ''}" data-part="${escapeHtml(reward.partName)}">${btnText}</button></td>
        </tr>`;
    });
    html += `</tbody></table>`;
    // Ссылка на общий список реликвий
    html += `<p class="drop-locations">
        <a href="https://warframe.fandom.com/wiki/Void_Relic#Vaulted_Relics" target="_blank" rel="noopener">
            Drop locations on Warframe Wiki ↗
        </a>
    </p>`;
    resultsDiv.innerHTML = html;

    document.querySelectorAll('.wishlist-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); toggleWishlist('part', btn.dataset.part); });
    });
    document.querySelectorAll('.reward-part').forEach(td => {
        td.addEventListener('click', () => navigateTo({ type: 'part', name: td.dataset.part }));
    });
}

function escapeHtml(text) {
    return text.replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
}

// ================== EVENTS ==================
const handleInput = debounce(async (e) => {
    const q = e.target.value.trim();
    if (q.length < 3) { hideSuggestions(); return; }
    const suggestions = await fetchSuggestions(q);
    showSuggestions(suggestions);
}, 300);

searchInput.addEventListener('input', handleInput);
document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrapper')) hideSuggestions(); });
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const first = suggestionsList.querySelector('li');
        if (first && suggestionsList.classList.contains('visible')) { e.preventDefault(); first.click(); }
    }
});

renderWishlist();