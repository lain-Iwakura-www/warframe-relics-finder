const SEARCH_URL = '/api/search';
const RELIC_SEARCH_URL = '/api/search-relics';
const SETS_SEARCH_URL = '/api/search-sets';
const SETS_URL = '/api/sets';
const RELICS_URL = '/api/relics-for-part';
const RELIC_DETAILS_URL = '/api/relic-details';
const WISHLIST_KEY = 'warframeWishlist';

const searchInput = document.getElementById('searchInput');
const suggestionsList = document.getElementById('suggestions');
const resultsDiv = document.getElementById('results');
const wishlistItems = document.getElementById('wishlist-items');
const wishlistActions = document.getElementById('wishlist-actions');

let currentState = null;
const historyStack = [];
let wishlistSort = 'added';

// ================== WISHLIST ==================
function loadWishlist() {
    try {
        const raw = JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
        return raw.map(item => {
            const newItem = item.type ? item : { type: 'part', name: item.name, obtained: item.obtained || false };
            if (!newItem.addedAt) newItem.addedAt = Date.now();
            return newItem;
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
    saveWishlist(wishlist);
}

function sortWishlist(list) {
    const sorted = [...list];
    if (wishlistSort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (wishlistSort === 'obtained') {
        sorted.sort((a, b) => {
            const aOb = a.type === 'part' ? a.obtained : a.parts.every(p => p.obtained);
            const bOb = b.type === 'part' ? b.obtained : b.parts.every(p => p.obtained);
            return aOb - bOb;
        });
    }
    return sorted;
}

function renderWishlist() {
    const openSets = new Set();
    document.querySelectorAll('.wishlist-set[open]').forEach(d => { if (d.dataset.setName) openSets.add(d.dataset.setName); });

    wishlistActions.innerHTML = '';
    if (wishlist.length > 0) {
        const sortLabel = document.createElement('label');
        sortLabel.textContent = 'Sort: ';
        sortLabel.className = 'sort-label';
        const sortSelect = document.createElement('select');
        sortSelect.innerHTML = `
            <option value="added" ${wishlistSort === 'added' ? 'selected' : ''}>Date added</option>
            <option value="name" ${wishlistSort === 'name' ? 'selected' : ''}>Name</option>
            <option value="obtained" ${wishlistSort === 'obtained' ? 'selected' : ''}>Owned status</option>`;
        sortSelect.addEventListener('change', (e) => { wishlistSort = e.target.value; renderWishlist(); });
        sortLabel.appendChild(sortSelect);
        wishlistActions.appendChild(sortLabel);

        const bestRelicsBtn = document.createElement('button');
        bestRelicsBtn.id = 'findBestRelicsBtn';
        bestRelicsBtn.textContent = '🔍 Find Best Relics';
        bestRelicsBtn.className = 'wishlist-btn';
        bestRelicsBtn.addEventListener('click', findBestRelics);
        wishlistActions.appendChild(bestRelicsBtn);
    }

    if (!wishlist.length) {
        wishlistItems.innerHTML = '<li class="empty">Nothing added yet.</li>';
        return;
    }

    const sorted = sortWishlist(wishlist);
    wishlistItems.innerHTML = '';
    sorted.forEach(item => {
        if (item.type === 'part') {
            const li = document.createElement('li');
            li.className = 'wishlist-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = item.obtained; cb.title = 'Owned';
            cb.addEventListener('change', () => { item.obtained = cb.checked; syncPartObtained(item.name, item.obtained); renderWishlist(); });
            const span = document.createElement('span');
            span.textContent = item.name;
            if (item.obtained) span.classList.add('obtained');
            span.addEventListener('click', () => { searchInput.value = item.name; navigateTo({ type: 'part', name: item.name }); });
            const del = document.createElement('button');
            del.className = 'delete-btn'; del.innerHTML = '×'; del.title = 'Remove';
            del.addEventListener('click', (e) => { e.stopPropagation(); wishlist = wishlist.filter(i => i !== item); saveWishlist(wishlist); renderWishlist(); });
            li.appendChild(cb); li.appendChild(span); li.appendChild(del);
            wishlistItems.appendChild(li);
        } else if (item.type === 'set') {
            const details = document.createElement('details');
            details.className = 'wishlist-set';
            details.dataset.setName = item.name;
            if (openSets.has(item.name)) details.setAttribute('open', '');
            const summary = document.createElement('summary');
            summary.innerHTML = `<span class="wishlist-set-name">📦 ${escapeHtml(item.name)}</span>`;
            const delSet = document.createElement('button');
            delSet.className = 'delete-btn'; delSet.innerHTML = '×'; delSet.title = 'Remove set';
            delSet.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); wishlist = wishlist.filter(i => i !== item); saveWishlist(wishlist); renderWishlist(); });
            const btnWrap = document.createElement('span'); btnWrap.className = 'wishlist-set-btns'; btnWrap.appendChild(delSet);
            summary.appendChild(btnWrap);
            details.appendChild(summary);
            const partsList = document.createElement('ul');
            partsList.className = 'wishlist-set-parts';
            item.parts.forEach(part => {
                const pli = document.createElement('li');
                pli.className = 'wishlist-item';
                const pcb = document.createElement('input');
                pcb.type = 'checkbox'; pcb.checked = part.obtained; pcb.title = 'Owned';
                pcb.addEventListener('change', () => { part.obtained = pcb.checked; syncPartObtained(part.name, part.obtained); renderWishlist(); });
                const pspan = document.createElement('span');
                pspan.textContent = part.name;
                if (part.obtained) pspan.classList.add('obtained');
                pspan.addEventListener('click', () => { searchInput.value = part.name; navigateTo({ type: 'part', name: part.name }); });
                pli.appendChild(pcb); pli.appendChild(pspan);
                partsList.appendChild(pli);
            });
            details.appendChild(partsList);
            wishlistItems.appendChild(details);
        }
    });
}

function toggleWishlist(type, name, parts = null) {
    if (type === 'part') {
        const ex = wishlist.find(item => item.type === 'part' && item.name === name);
        if (ex) wishlist = wishlist.filter(item => item !== ex);
        else wishlist.push({ type: 'part', name, obtained: false, addedAt: Date.now() });
    } else if (type === 'set') {
        const ex = wishlist.find(item => item.type === 'set' && item.name === name);
        if (ex) wishlist = wishlist.filter(item => item !== ex);
        else if (parts) {
            const pa = parts.map(p => ({ name: p.name, obtained: getPartObtained(p.name) }));
            wishlist.push({ type: 'set', name, parts: pa, addedAt: Date.now() });
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
    if (!uniqueParts.length) { alert('All parts obtained!'); return; }
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<p>Finding best relics...</p>';
    try {
        const resp = await fetch('/api/optimal-relics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: uniqueParts }) });
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">Error ${resp.status}</p>`; return; }
        const data = await resp.json();
        if (!data.relics || data.relics.length === 0) { resultsDiv.innerHTML = '<p>No relics found.</p>'; return; }
        renderBestRelics(data.relics);
    } catch (err) { console.error(err); resultsDiv.innerHTML = '<p class="error">Network error.</p>'; }
}

function renderBestRelics(relics) {
    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    html += `<h2>🎯 Best Relics for Your Missing Parts</h2>`;
    html += `<div class="filter-row"><label><input type="checkbox" id="showAvailableOnlyBest"> Show available only</label></div>`;
    html += `<table id="bestRelicsTable"><thead><tr><th>Relic</th><th>Status</th><th>Missing Parts</th><th>Count</th></tr></thead><tbody>`;
    relics.forEach(r => {
        const status = r.isResurgence ? 'Resurgence' : (r.isVaulted ? 'Vaulted' : 'Available');
        const cls = r.isResurgence ? 'not-vaulted' : (r.isVaulted ? 'vaulted' : 'not-vaulted');
        const rowCls = r.isVaulted && !r.isResurgence ? 'vaulted-row' : 'available-row';
        const safeParts = r.desiredParts.map(escapeHtml).join(', ');
        html += `<tr class="${rowCls}"><td class="relic-name">${escapeHtml(r.relic)}</td><td class="${cls}">${status}</td><td>${safeParts}</td><td>${r.desiredCount}</td></tr>`;
    });
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;
    document.getElementById('showAvailableOnlyBest')?.addEventListener('change', function() {
        document.querySelectorAll('#bestRelicsTable tbody tr').forEach(row => {
            row.style.display = (this.checked && row.classList.contains('vaulted-row')) ? 'none' : '';
        });
    });
    document.querySelectorAll('.relic-name').forEach(td => td.addEventListener('click', () => navigateTo({ type: 'relic', name: td.textContent.trim() })));
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

function goBack() { if (historyStack.length) { const prev = historyStack.pop(); currentState = null; navigateTo(prev, false); } }

// ================== SEARCH ==================
function debounce(fn, delay) { let timer; return function(...a) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, a), delay); }; }

async function fetchSuggestions(query) {
    const [pResp, sResp, rResp] = await Promise.allSettled([
        fetch(`${SEARCH_URL}?q=${encodeURIComponent(query)}`),
        fetch(`${SETS_SEARCH_URL}?q=${encodeURIComponent(query)}`),
        fetch(`${RELIC_SEARCH_URL}?q=${encodeURIComponent(query)}`)
    ]);
    let parts = [], sets = [], relics = [];
    if (pResp.status === 'fulfilled' && pResp.value.ok) parts = (await pResp.value.json()).parts || [];
    if (sResp.status === 'fulfilled' && sResp.value.ok) sets = (await sResp.value.json()).sets || [];
    if (rResp.status === 'fulfilled' && rResp.value.ok) relics = (await rResp.value.json()).relics || [];
    return { parts, sets, relics };
}

function showSuggestions({ parts, sets, relics }) {
    suggestionsList.innerHTML = '';
    const items = [];
    sets.forEach(s => items.push({ label: `📦 ${s}`, type: 'set', value: s }));
    parts.forEach(p => items.push({ label: p, type: 'part', value: p }));
    relics.forEach(r => items.push({ label: `🔹 ${r}`, type: 'relic', value: r }));
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
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">Set not found</p>`; return; }
        renderSetPage(await resp.json());
    } catch (e) { resultsDiv.innerHTML = '<p class="error">Error</p>'; }
}

function renderSetPage(data) {
    const { setName, parts } = data;
    const inList = isSetInWishlist(setName);
    const btnText = inList ? '❌ Remove set' : '➕ Add set';
    const btnClass = inList ? 'wishlist-btn remove' : 'wishlist-btn';
    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    html += `<div class="set-info"><h2>📦 ${escapeHtml(setName)}</h2><button class="${btnClass}" id="toggleSetBtn">${btnText}</button></div>`;
    html += `<table class="set-table"><thead><tr><th>Part</th><th>Rarity</th><th>Relics</th><th>Ducats</th></tr></thead><tbody>`;
    parts.forEach(p => html += `<tr><td><a class="part-link" data-part="${escapeHtml(p.name)}">${escapeHtml(p.name)}</a></td><td>${p.rarity}</td><td>${p.relicCount}</td><td>${p.ducats}</td></tr>`);
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;
    document.getElementById('toggleSetBtn').addEventListener('click', () => toggleWishlist('set', setName, parts));
    document.querySelectorAll('.part-link').forEach(l => l.addEventListener('click', () => navigateTo({ type: 'part', name: l.dataset.part })));
}

// ================== PART PAGE ==================
async function loadRelics(partName) {
    resultsDiv.innerHTML = '<p>Loading...</p>';
    try {
        const resp = await fetch(`${RELICS_URL}?part=${encodeURIComponent(partName)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">Error ${resp.status}</p>`; return; }
        const data = await resp.json();
        if (!data.relics.length) { resultsDiv.innerHTML = '<p>No relics found.</p>'; return; }
        renderRelicTable(data);
    } catch (e) { resultsDiv.innerHTML = '<p class="error">Error</p>'; }
}

function renderRelicTable(data) {
    const unique = []; const seen = new Set();
    for (const r of data.relics) {
        const base = r.name.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '');
        if (seen.has(base)) continue;
        seen.add(base);
        unique.push({ ...r, name: base, fullName: r.name });
    }
    unique.sort((a, b) => a.isVaulted - b.isVaulted || a.name.localeCompare(b.name));
    const rarity = data.rarity || 'Common';
    const chances = unique[0]?.dropChances || {};
    const ducats = data.ducats || 0;
    const inWish = isInWishlist(data.part);
    const btnText = inWish ? '❌ Remove from wishlist' : '➕ Add to wishlist';
    const btnClass = inWish ? 'wishlist-btn remove' : 'wishlist-btn';

    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    const display = data.setName && data.part.startsWith(data.setName + ' ') ? `<a class="set-link">${escapeHtml(data.setName)}</a>${escapeHtml(data.part.slice(data.setName.length))}` : escapeHtml(data.part);
    html += `<div class="part-info"><h2>${display}</h2><button class="${btnClass}">${btnText}</button></div>`;
    html += `<div class="rarity-info"><span>Rarity: <strong>${rarity}</strong></span> <span class="chances-summary">(Intact: ${chances.Intact} | Exceptional: ${chances.Exceptional} | Flawless: ${chances.Flawless} | Radiant: ${chances.Radiant})</span> <span class="ducats">| ${ducats} ducats</span><span class="platinum-price">| platinum N/A</span></div>`;
    html += `<div class="filter-row"><label><input type="checkbox" id="showAvailableOnly"> Show available only</label></div>`;
    html += `<table id="relicsTable"><thead><tr><th>Relic</th><th>Status</th></tr></thead><tbody>`;
    unique.forEach(r => {
        const status = r.isResurgence ? 'Resurgence' : (r.isVaulted ? 'Vaulted' : 'Available');
        const cls = r.isResurgence ? 'not-vaulted' : (r.isVaulted ? 'vaulted' : 'not-vaulted');
        const rowCls = r.isVaulted && !r.isResurgence ? 'vaulted-row' : 'available-row';
        html += `<tr class="${rowCls}"><td class="relic-name" data-full-name="${escapeHtml(r.fullName)}">${r.name}</td><td class="${cls}">${status}</td></tr>`;
    });
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;

    document.querySelector('.wishlist-btn')?.addEventListener('click', () => toggleWishlist('part', data.part));
    document.getElementById('showAvailableOnly')?.addEventListener('change', function() {
        document.querySelectorAll('#relicsTable tbody tr').forEach(row => {
            row.style.display = (this.checked && row.classList.contains('vaulted-row')) ? 'none' : '';
        });
    });
    document.querySelectorAll('.relic-name').forEach(td => td.addEventListener('click', () => {
        navigateTo({ type: 'relic', name: td.dataset.fullName.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '') });
    }));
    document.querySelector('.set-link')?.addEventListener('click', () => navigateTo({ type: 'set', name: data.setName }));
}

// ================== RELIC PAGE ==================
async function loadRelicDetails(relicName) {
    const base = relicName.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '');
    resultsDiv.innerHTML = '<p>Loading...</p>';
    try {
        const resp = await fetch(`${RELIC_DETAILS_URL}?relic=${encodeURIComponent(base)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">Error ${resp.status}</p>`; return; }
        renderRelicDetails(await resp.json());
    } catch (e) { resultsDiv.innerHTML = '<p class="error">Error</p>'; }
}

function renderRelicDetails(data) {
    const { relicName, isVaulted, isResurgence, rewards } = data;
    const status = isResurgence ? 'Resurgence' : (isVaulted ? 'Vaulted' : 'Available');
    const cls = isResurgence ? 'not-vaulted' : (isVaulted ? 'vaulted' : 'not-vaulted');
    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">← Back</button>`;
    html += `<div class="relic-info"><h2>${escapeHtml(relicName)}</h2><p>Status: <span class="${cls}">${status}</span></p></div>`;
    html += `<table class="rewards-table"><thead><tr><th>Reward</th><th>Rarity</th><th>Intact</th><th>Exceptional</th><th>Flawless</th><th>Radiant</th><th>Ducats</th><th></th></tr></thead><tbody>`;
    rewards.forEach(r => {
        const ch = r.dropChances;
        const inWish = isInWishlist(r.partName);
        html += `<tr><td class="reward-part" data-part="${escapeHtml(r.partName)}">${escapeHtml(r.partName)}</td><td>${r.rarity}</td><td>${ch.Intact}</td><td>${ch.Exceptional}</td><td>${ch.Flawless}</td><td>${ch.Radiant}</td><td>${r.ducats}</td><td><button class="wishlist-btn ${inWish ? 'remove' : ''}" data-part="${escapeHtml(r.partName)}">${inWish ? '❌ Remove' : '➕ Add'}</button></td></tr>`;
    });
    html += `</tbody></table>`;
    html += `<p class="drop-locations"><a href="https://warframe.fandom.com/wiki/Special:Search?query=${encodeURIComponent(relicName)}" target="_blank">Search on EN Wiki ↗</a> | <a href="https://warframe.fandom.com/ru/wiki/Special:Search?query=${encodeURIComponent(relicName)}" target="_blank">Поиск на RU Wiki ↗</a></p>`;
    resultsDiv.innerHTML = html;

    document.querySelectorAll('.wishlist-btn').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); toggleWishlist('part', b.dataset.part); }));
    document.querySelectorAll('.reward-part').forEach(td => td.addEventListener('click', () => navigateTo({ type: 'part', name: td.dataset.part })));
}

function escapeHtml(text) { return text.replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }

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