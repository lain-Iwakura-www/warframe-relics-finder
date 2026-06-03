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
let wishlistOrder = 'asc';

// ================== WISHLIST ==================
function loadWishlist() {
    try {
        const raw = JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
        return raw.map(item => {
            const newItem = item.type ? item : { type: 'part', name: item.name || 'Unknown Part', obtained: item.obtained || false };
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
function isPartInAnyWishlist(partName) {
    if (isInWishlist(partName)) return true;
    for (const item of wishlist) {
        if (item.type === 'set' && item.parts.some(p => p.name === partName)) return true;
    }
    return false;
}
function getPartObtained(partName) {
    const partEntry = wishlist.find(item => item.type === 'part' && item.name === partName);
    if (partEntry) return partEntry.obtained;
    for (const item of wishlist) {
        if (item.type === 'set') {
            const partInSet = item.parts.find(p => p.name === partName);
            if (partInSet) return partInSet.obtained;
        }
    }
    return false;
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
    if (wishlistSort === 'name') {
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    else if (wishlistSort === 'obtained') {
        sorted.sort((a, b) => {
            const aOb = (a.type === 'part') ? (a.obtained ? 1 : 0) : a.parts.filter(p => p.obtained).length;
            const bOb = (b.type === 'part') ? (b.obtained ? 1 : 0) : b.parts.filter(p => p.obtained).length;
            return aOb - bOb;
        });
    }
    if (wishlistOrder === 'desc') sorted.reverse();
    return sorted;
}

function renderWishlist() {
    const openSets = new Set();
    document.querySelectorAll('.wishlist-set[open]').forEach(d => {
        if (d.dataset.setName) openSets.add(d.dataset.setName);
    });

    wishlistActions.innerHTML = '';
    if (wishlist.length > 0) {
        const sortLabel = document.createElement('label');
        sortLabel.textContent = t('sort') + ' ';
        sortLabel.className = 'sort-label';
        const sortSelect = document.createElement('select');
        sortSelect.innerHTML = `
            <option value="added" ${wishlistSort === 'added' ? 'selected' : ''}>${t('sortAdded')}</option>
            <option value="name" ${wishlistSort === 'name' ? 'selected' : ''}>${t('sortName')}</option>
            <option value="obtained" ${wishlistSort === 'obtained' ? 'selected' : ''}>${t('sortObtained')}</option>`;
        sortSelect.addEventListener('change', (e) => {
            wishlistSort = e.target.value;
            renderWishlist();
        });
        sortLabel.appendChild(sortSelect);

        // Кнопка направления сортировки
        const orderBtn = document.createElement('button');
        orderBtn.id = 'sortOrderBtn';
        orderBtn.textContent = wishlistOrder === 'asc' ? '↑' : '↓';
        orderBtn.title = wishlistOrder === 'asc' ? 'Ascending' : 'Descending';
        orderBtn.className = 'sort-order-btn';
        orderBtn.addEventListener('click', () => {
            wishlistOrder = wishlistOrder === 'asc' ? 'desc' : 'asc';
            renderWishlist();
        });
        sortLabel.appendChild(orderBtn);

        wishlistActions.appendChild(sortLabel);

        const bestRelicsBtn = document.createElement('button');
        bestRelicsBtn.id = 'findBestRelicsBtn';
        bestRelicsBtn.textContent = t('findBestRelics');
        bestRelicsBtn.className = 'wishlist-btn';
        bestRelicsBtn.addEventListener('click', findBestRelics);
        wishlistActions.appendChild(bestRelicsBtn);
    }

    if (!wishlist.length) {
        wishlistItems.innerHTML = `<li class="empty">${t('nothingAdded')}</li>`;
        return;
    }

    const sorted = sortWishlist(wishlist);
    wishlistItems.innerHTML = '';

    sorted.forEach((item) => {
        const originalIndex = wishlist.indexOf(item);

        if (item.type === 'part') {
            const li = document.createElement('li');
            li.className = 'wishlist-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = item.obtained; cb.title = t('owned');
            cb.addEventListener('change', () => {
                wishlist[originalIndex].obtained = cb.checked;
                syncPartObtained(item.name, cb.checked);
                saveWishlist(wishlist);
                renderWishlist();
            });
            const span = document.createElement('span');
            span.textContent = item.name;
            if (item.obtained) span.classList.add('obtained');
            span.addEventListener('click', () => { searchInput.value = item.name; navigateTo({ type: 'part', name: item.name }); });
            const del = document.createElement('button');
            del.className = 'delete-btn'; del.innerHTML = '×'; del.title = t('delete');
            del.addEventListener('click', (e) => { e.stopPropagation(); wishlist.splice(originalIndex, 1); saveWishlist(wishlist); renderWishlist(); });
            li.appendChild(cb); li.appendChild(span); li.appendChild(del);
            wishlistItems.appendChild(li);
        } else if (item.type === 'set') {
            const wrapper = document.createElement('div');
            wrapper.className = 'wishlist-set-wrapper';

            const details = document.createElement('details');
            details.className = 'wishlist-set';
            details.dataset.setName = item.name;
            if (openSets.has(item.name)) details.setAttribute('open', '');

            const summary = document.createElement('summary');
            summary.innerHTML = `<span class="wishlist-set-name">📦 ${escapeHtml(item.name)}</span>`;
            details.appendChild(summary);

            const delSet = document.createElement('button');
            delSet.className = 'delete-btn set-delete-btn';
            delSet.innerHTML = '×'; delSet.title = t('deleteSet');
            delSet.addEventListener('click', (e) => { e.stopPropagation(); wishlist.splice(originalIndex, 1); saveWishlist(wishlist); renderWishlist(); });
            wrapper.appendChild(details);
            wrapper.appendChild(delSet);

            const partsList = document.createElement('ul');
            partsList.className = 'wishlist-set-parts';
            item.parts.forEach((part, partIndex) => {
                const pli = document.createElement('li');
                pli.className = 'wishlist-item';
                const pcb = document.createElement('input');
                pcb.type = 'checkbox'; pcb.checked = part.obtained; pcb.title = t('owned');
                pcb.addEventListener('change', () => {
                    wishlist[originalIndex].parts[partIndex].obtained = pcb.checked;
                    syncPartObtained(part.name, pcb.checked);
                    saveWishlist(wishlist);
                    renderWishlist();
                });
                const pspan = document.createElement('span');
                pspan.textContent = part.name;
                if (part.obtained) pspan.classList.add('obtained');
                pspan.addEventListener('click', () => { searchInput.value = part.name; navigateTo({ type: 'part', name: part.name }); });
                pli.appendChild(pcb); pli.appendChild(pspan);
                partsList.appendChild(pli);
            });
            details.appendChild(partsList);
            wishlistItems.appendChild(wrapper);

            // Клик по названию набора → переход на страницу набора
            summary.addEventListener('click', (e) => {
                if (e.target.closest('.wishlist-set-name')) {
                    e.preventDefault();
                    navigateTo({ type: 'set', name: item.name });
                }
            });
        }
    });

    // Автообновление страницы набора, если она открыта
    if (currentState && currentState.type === 'set') {
        loadSetPage(currentState.name);
    }
    // Автообновление страницы реликвии, если она открыта
    if (currentState && currentState.type === 'relic') {
        loadRelicDetails(currentState.name);
    }
}

function toggleWishlist(type, name, parts = null) {
    if (type === 'part') {
        const ex = wishlist.find(item => item.type === 'part' && item.name === name);
        if (ex) wishlist = wishlist.filter(item => item !== ex);
        else wishlist.push({ type: 'part', name, obtained: getPartObtained(name), addedAt: Date.now() });
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
    currentState = null;
    const partNames = [];
    wishlist.forEach(item => {
        if (item.type === 'part' && !item.obtained && item.name) partNames.push(item.name);
        else if (item.type === 'set' && item.parts) {
            item.parts.forEach(p => { if (!p.obtained && p.name) partNames.push(p.name); });
        }
    });
    const uniqueParts = [...new Set(partNames)];
    if (!uniqueParts.length) { alert(t('allObtained')); return; }
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `<p>${t('findBest')}</p>`;
    try {
        const resp = await fetch('/api/optimal-relics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: uniqueParts }) });
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">${t('error')} ${resp.status}</p>`; return; }
        const data = await resp.json();
        if (!data.relics || data.relics.length === 0) { resultsDiv.innerHTML = `<p>${t('partNotFound')}</p>`; return; }
        renderBestRelics(data.relics);
    } catch (err) { console.error(err); resultsDiv.innerHTML = `<p class="error">${t('error')}</p>`; }
}

function renderBestRelics(relics) {
    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">${t('back')}</button>`;
    html += `<h2>${t('bestRelicsTitle')}</h2>`;
    html += `<div class="filter-row"><label><input type="checkbox" id="showAvailableOnlyBest" checked> ${t('showAvailableOnly')}</label></div>`;
    html += `<table id="bestRelicsTable"><thead><tr><th>${t('relic')}</th><th>${t('status')}</th><th>${t('missingParts')}</th><th>${t('count')}</th></tr></thead><tbody>`;
    relics.forEach(r => {
        const status = r.isVaulted ? t('vaulted') : t('available');
        const cls = r.isVaulted ? 'vaulted' : 'not-vaulted';
        const rowCls = r.isVaulted ? 'vaulted-row' : 'available-row';
        const safeParts = r.desiredParts.map(escapeHtml).join(', ');
        html += `<tr class="${rowCls}"><td class="relic-name">${escapeHtml(r.relic)}</td><td class="${cls}">${status}</td><td>${safeParts}</td><td>${r.desiredCount}</td></tr>`;
    });
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;
    const filterCheckbox = document.getElementById('showAvailableOnlyBest');
    if (filterCheckbox && filterCheckbox.checked) {
        document.querySelectorAll('#bestRelicsTable tbody tr').forEach(row => {
            if (row.classList.contains('vaulted-row')) row.style.display = 'none';
        });
    }
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
    resultsDiv.innerHTML = `<p>${t('loadingSet')}</p>`;
    try {
        const resp = await fetch(`${SETS_URL}?name=${encodeURIComponent(setName)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">${t('setNotFound')}</p>`; return; }
        renderSetPage(await resp.json());
    } catch (e) { resultsDiv.innerHTML = `<p class="error">${t('error')}</p>`; }
}

function renderSetPage(data) {
    const { setName, parts } = data;
    const setInWishlist = isSetInWishlist(setName);
    const btnText = setInWishlist ? t('removeSet') : t('addSet');
    const btnClass = setInWishlist ? 'wishlist-btn remove' : 'wishlist-btn';

    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">${t('back')}</button>`;
    html += `<div class="set-info"><h2>📦 ${escapeHtml(setName)}</h2><button class="${btnClass}" id="toggleSetBtn">${btnText}</button></div>`;
    html += `<table class="set-table"><thead><tr><th>${t('part')}</th><th>${t('rarity')}</th><th>${t('relics')}</th><th>${t('ducats')}</th></tr></thead><tbody>`;

    parts.forEach(part => {
        const obtained = getPartObtained(part.name);
        const obtainedIcon = obtained ? ' ✔️' : '';
        html += `<tr>
            <td><a class="part-link" data-part="${escapeHtml(part.name)}">${escapeHtml(part.name)}${obtainedIcon}</a></td>
            <td>${part.rarity}</td>
            <td>${part.relicCount}</td>
            <td>${part.ducats}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;

    document.getElementById('toggleSetBtn').addEventListener('click', () => toggleWishlist('set', setName, parts));
    document.querySelectorAll('.part-link').forEach(link => {
        link.addEventListener('click', () => navigateTo({ type: 'part', name: link.dataset.part }));
    });
}

// ================== PART PAGE ==================
async function loadRelics(partName) {
    resultsDiv.innerHTML = `<p>${t('loadingPart')}</p>`;
    try {
        const resp = await fetch(`${RELICS_URL}?part=${encodeURIComponent(partName)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">${t('error')} ${resp.status}</p>`; return; }
        const data = await resp.json();
        if (!data.relics.length) { resultsDiv.innerHTML = `<p>${t('partNotFound')}</p>`; return; }
        renderRelicTable(data);
    } catch (e) { resultsDiv.innerHTML = `<p class="error">${t('error')}</p>`; }
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
    const setName = data.setName;
    const inWishSet = setName && isSetInWishlist(setName);
    const btnText = inWish ? t('removeFromWishlist') : t('addToWishlist');
    const btnClass = inWish ? 'wishlist-btn remove' : 'wishlist-btn';

    let wishlistTag = '';
    if (inWish) {
        wishlistTag = ' ⭐ In wishlist';
    } else if (inWishSet) {
        wishlistTag = ' 📦 In wishlist set';
    }

    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">${t('back')}</button>`;
    const display = setName && data.part.startsWith(setName + ' ') ? `<a class="set-link">${escapeHtml(setName)}</a>${escapeHtml(data.part.slice(setName.length))}` : escapeHtml(data.part);
    html += `<div class="part-info"><h2>${display}${wishlistTag}</h2><button class="${btnClass}">${btnText}</button></div>`;
    html += `<div class="rarity-info"><span>${t('rarity')} <strong>${rarity}</strong></span> <span class="chances-summary">(Intact: ${chances.Intact} | Exceptional: ${chances.Exceptional} | Flawless: ${chances.Flawless} | Radiant: ${chances.Radiant})</span> <span class="ducats">| ${ducats} ${t('ducats')}</span></div>`;
    html += `<div class="filter-row"><label><input type="checkbox" id="showAvailableOnly" checked> ${t('showAvailableOnly')}</label></div>`;
    html += `<table id="relicsTable"><thead><tr><th>${t('relic')}</th><th>${t('status')}</th></tr></thead><tbody>`;
    unique.forEach(r => {
        const status = r.isVaulted ? t('vaulted') : t('available');
        const cls = r.isVaulted ? 'vaulted' : 'not-vaulted';
        const rowCls = r.isVaulted ? 'vaulted-row' : 'available-row';
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
    // Принудительно применить фильтр при первой загрузке
    const filterCheckbox = document.getElementById('showAvailableOnly');
    if (filterCheckbox && filterCheckbox.checked) {
        document.querySelectorAll('#relicsTable tbody tr').forEach(row => {
            if (row.classList.contains('vaulted-row')) row.style.display = 'none';
        });
    }
    document.querySelectorAll('.relic-name').forEach(td => td.addEventListener('click', () => {
        navigateTo({ type: 'relic', name: td.dataset.fullName.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '') });
    }));
    document.querySelector('.set-link')?.addEventListener('click', () => navigateTo({ type: 'set', name: setName }));
}

// ================== RELIC PAGE ==================
async function loadRelicDetails(relicName) {
    const base = relicName.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '');
    resultsDiv.innerHTML = `<p>${t('loadingRelic')}</p>`;
    try {
        const resp = await fetch(`${RELIC_DETAILS_URL}?relic=${encodeURIComponent(base)}`);
        if (!resp.ok) { resultsDiv.innerHTML = `<p class="error">${t('error')} ${resp.status}</p>`; return; }
        const data = await resp.json();
        renderRelicDetails(data);
    } catch (e) { resultsDiv.innerHTML = `<p class="error">${t('error')}</p>`; }
}

function renderRelicDetails(data) {
    const { relicName, isVaulted, rewards } = data;
    const status = isVaulted ? t('vaulted') : t('available');
    const cls = isVaulted ? 'vaulted' : 'not-vaulted';
    let html = '';
    if (historyStack.length > 0) html += `<button class="back-btn" onclick="goBack()">${t('back')}</button>`;
    html += `<div class="relic-info"><h2>${escapeHtml(relicName)}</h2><p>${t('status')}: <span class="${cls}">${status}</span></p></div>`;
    html += `<table class="rewards-table"><thead><tr><th>${t('reward')}</th><th>${t('rarity')}</th><th>${t('intact')}</th><th>${t('exceptional')}</th><th>${t('flawless')}</th><th>${t('radiant')}</th><th>${t('ducats')}</th><th></th></tr></thead><tbody>`;

    rewards.forEach(reward => {
        const chances = reward.dropChances;
        const hasSeparate = isInWishlist(reward.partName);
        const inAny = isPartInAnyWishlist(reward.partName);
        const obtained = inAny ? getPartObtained(reward.partName) : false;
        let badge = '';
        if (inAny) badge = obtained ? ' ✔️' : ' ⭐';

        let btnHtml;
        if (hasSeparate) {
            btnHtml = `<button class="wishlist-btn remove" data-part="${escapeHtml(reward.partName)}">❌ Remove</button>`;
        } else if (inAny) {
            btnHtml = `<button class="wishlist-btn in-set" data-part="${escapeHtml(reward.partName)}" disabled>📦 In set</button>`;
        } else {
            btnHtml = `<button class="wishlist-btn" data-part="${escapeHtml(reward.partName)}">➕ Add</button>`;
        }

        html += `<tr>
            <td class="reward-part" data-part="${escapeHtml(reward.partName)}">${escapeHtml(reward.partName)}${badge}</td>
            <td>${reward.rarity}</td>
            <td>${chances.Intact}</td>
            <td>${chances.Exceptional}</td>
            <td>${chances.Flawless}</td>
            <td>${chances.Radiant}</td>
            <td>${reward.ducats}</td>
            <td>${btnHtml}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    html += `<p class="drop-locations">${t('dropLocations')} <a href="https://warframe.fandom.com/wiki/Special:Search?query=${encodeURIComponent(relicName)}" target="_blank">${t('searchEnWiki')}</a> | <a href="https://warframe.fandom.com/ru/wiki/Special:Search?query=${encodeURIComponent(relicName)}" target="_blank">${t('searchRuWiki')}</a></p>`;
    resultsDiv.innerHTML = html;

    document.querySelectorAll('.wishlist-btn:not(.in-set)').forEach(b => {
        b.addEventListener('click', (e) => { e.stopPropagation(); toggleWishlist('part', b.dataset.part); updateRelicPageButtons(); });
    });
    document.querySelectorAll('.reward-part').forEach(td => td.addEventListener('click', () => navigateTo({ type: 'part', name: td.dataset.part })));
}

function updateRelicPageButtons() {
    const buttons = resultsDiv.querySelectorAll('.wishlist-btn[data-part]');
    buttons.forEach(btn => {
        const partName = btn.dataset.part;
        const hasSeparate = isInWishlist(partName);
        const inAny = isPartInAnyWishlist(partName);

        if (hasSeparate) {
            btn.className = 'wishlist-btn remove';
            btn.textContent = '❌ Remove';
            btn.disabled = false;
            btn.style.display = '';
        } else if (inAny) {
            btn.className = 'wishlist-btn in-set';
            btn.textContent = '📦 In set';
            btn.disabled = true;
            btn.style.display = '';
        } else {
            btn.className = 'wishlist-btn';
            btn.textContent = '➕ Add';
            btn.disabled = false;
            btn.style.display = '';
        }
    });

    const rewardCells = resultsDiv.querySelectorAll('.reward-part');
    rewardCells.forEach(td => {
        const partName = td.dataset.part;
        const inAny = isPartInAnyWishlist(partName);
        const obtained = inAny ? getPartObtained(partName) : false;
        let badge = '';
        if (inAny) badge = obtained ? ' ✔️' : ' ⭐';
        const cleanText = td.textContent.replace(/[ ⭐✔️]+$/, '');
        td.innerHTML = escapeHtml(cleanText) + badge;
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

// Инициализация языка (использует глобальные функции из lang.js)
document.getElementById('btnEn').addEventListener('click', () => setLanguage('en'));
document.getElementById('btnRu').addEventListener('click', () => setLanguage('ru'));
applyLanguage();
document.querySelector('.disclaimer').textContent = t('disclaimer');
document.querySelector('.rarity-disclaimer').textContent = t('rarityDisclaimer');
document.getElementById('headerTitle').textContent = t('title');

function updateResurgenceLink() {
    const link = document.querySelector('.resurgence-link');
    if (link) {
        link.href = currentLang === 'ru' ? 'https://www.warframe.com/ru/prime-resurgence' : 'https://www.warframe.com/prime-resurgence';
    }
}
updateResurgenceLink();
const originalSetLanguage = setLanguage;
setLanguage = function(lang) {
    originalSetLanguage(lang);
    updateResurgenceLink();
};

renderWishlist();