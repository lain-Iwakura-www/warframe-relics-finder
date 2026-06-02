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
const wishlistActions = document.getElementById('wishlist-actions');

let currentState = null;
const historyStack = [];
let wishlistSort = 'added'; // 'added', 'name', 'obtained'

// ================== WISHLIST ==================
function loadWishlist() {
    try {
        const raw = JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
        return raw.map(item => {
            const newItem = item.type ? item : { type: 'part', name: item.name, obtained: item.obtained || false };
            if (!newItem.addedAt) newItem.addedAt = Date.now(); // миграция
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
        else if (item.type === 'set') {
            item.parts.forEach(p => { if (p.name === partName) p.obtained = obtained; });
        }
    });
    saveWishlist(wishlist);
}

// Сортировка копии массива
function sortWishlist(list) {
    const sorted = [...list];
    if (wishlistSort === 'name') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (wishlistSort === 'obtained') {
        sorted.sort((a, b) => {
            const aObtained = a.type === 'part' ? a.obtained : a.parts.every(p => p.obtained);
            const bObtained = b.type === 'part' ? b.obtained : b.parts.every(p => p.obtained);
            return aObtained - bObtained;
        });
    } // по умолчанию 'added' — ничего не делаем (исходный порядок)
    return sorted;
}

function renderWishlist() {
    const openSets = new Set();
    document.querySelectorAll('.wishlist-set[open]').forEach(details => {
        const name = details.dataset.setName;
        if (name) openSets.add(name);
    });

    // Панель действий
    wishlistActions.innerHTML = '';
    if (wishlist.length > 0) {
        const sortLabel = document.createElement('label');
        sortLabel.textContent = 'Sort: ';
        sortLabel.className = 'sort-label';
        const sortSelect = document.createElement('select');
        sortSelect.innerHTML = `
            <option value="added" ${wishlistSort === 'added' ? 'selected' : ''}>Date added</option>
            <option value="name" ${wishlistSort === 'name' ? 'selected' : ''}>Name</option>
            <option value="obtained" ${wishlistSort === 'obtained' ? 'selected' : ''}>Owned status</option>
        `;
        sortSelect.addEventListener('change', (e) => {
            wishlistSort = e.target.value;
            renderWishlist();
        });
        sortLabel.appendChild(sortSelect);
        wishlistActions.appendChild(sortLabel);

        const bestRelicsBtn = document.createElement('button');
        bestRelicsBtn.id = 'findBestRelicsBtn';
        bestRelicsBtn.textContent = '🔍 Find Best Relics';
        bestRelicsBtn.className = 'wishlist-btn';
        bestRelicsBtn.addEventListener('click', findBestRelics);
        wishlistActions.appendChild(bestRelicsBtn);
    }

    // Основной список
    if (!wishlist.length) {
        wishlistItems.innerHTML = '<li class="empty">Nothing added yet.</li>';
        return;
    }

    const sorted = sortWishlist(wishlist);
    wishlistItems.innerHTML = '';
    sorted.forEach((item) => {
        if (item.type === 'part') {
            const li = document.createElement('li');
            li.className = 'wishlist-item';
            li.dataset.name = item.name;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.checked = item.obtained; checkbox.title = 'Owned';
            checkbox.addEventListener('change', () => {
                item.obtained = checkbox.checked;
                syncPartObtained(item.name, item.obtained);
                renderWishlist();
            });
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            if (item.obtained) nameSpan.classList.add('obtained');
            nameSpan.addEventListener('click', () => {
                searchInput.value = item.name;
                navigateTo({ type: 'part', name: item.name });
            });
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn'; deleteBtn.innerHTML = '×'; deleteBtn.title = 'Remove';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                wishlist = wishlist.filter(i => i !== item);
                saveWishlist(wishlist);
                renderWishlist();
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
                wishlist = wishlist.filter(i => i !== item);
                saveWishlist(wishlist);
                renderWishlist();
                if (currentState?.type === 'set' && currentState.name === item.name) refreshCurrentPage();
            });
            const btnsWrapper = document.createElement('span');
            btnsWrapper.className = 'wishlist-set-btns';
            btnsWrapper.appendChild(deleteSetBtn);
            summary.appendChild(btnsWrapper);
            details.appendChild(summary);

            const partsList = document.createElement('ul');
            partsList.className = 'wishlist-set-parts';
            item.parts.forEach(part => {
                const partLi = document.createElement('li');
                partLi.className = 'wishlist-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox'; checkbox.checked = part.obtained; checkbox.title = 'Owned';
                checkbox.addEventListener('change', () => {
                    part.obtained = checkbox.checked;
                    syncPartObtained(part.name, part.obtained);
                    renderWishlist();
                });
                const nameSpan = document.createElement('span');
                nameSpan.textContent = part.name;
                if (part.obtained) nameSpan.classList.add('obtained');
                nameSpan.addEventListener('click', () => {
                    searchInput.value = part.name;
                    navigateTo({ type: 'part', name: part.name });
                });
                partLi.appendChild(checkbox); partLi.appendChild(nameSpan);
                partsList.appendChild(partLi);
            });
            details.appendChild(partsList);
            wishlistItems.appendChild(details);
        }
    });
}

function toggleWishlist(type, name, parts = null) {
    if (type === 'part') {
        const existing = wishlist.find(item => item.type === 'part' && item.name === name);
        if (existing) wishlist = wishlist.filter(item => item !== existing);
        else wishlist.push({ type: 'part', name, obtained: false, addedAt: Date.now() });
    } else if (type === 'set') {
        const existing = wishlist.find(item => item.type === 'set' && item.name === name);
        if (existing) wishlist = wishlist.filter(item => item !== existing);
        else if (parts) {
            const partsArray = parts.map(p => ({ name: p.name, obtained: getPartObtained(p.name) }));
            wishlist.push({ type: 'set', name, parts: partsArray, addedAt: Date.now() });
        }
    }
    saveWishlist(wishlist);
    renderWishlist();
    if (currentState) {
        if (currentState.type === 'set' && currentState.name === name) loadSetPage(name);
        else if (currentState.type === 'part' && currentState.name === name) loadRelics(name);
    }
}

// ... остальные функции без изменений до findBestRelics ...

// В findBestRelics: теперь собираем части из wishlist с учётом нового формата
async function findBestRelics() {
    const partNames = [];
    wishlist.forEach(item => {
        if (item.type === 'part' && !item.obtained) partNames.push(item.name);
        else if (item.type === 'set') {
            item.parts.forEach(p => { if (!p.obtained) partNames.push(p.name); });
        }
    });
    const uniqueParts = [...new Set(partNames)];
    if (!uniqueParts.length) {
        alert('All parts obtained! Nothing to search.');
        return;
    }
    // ... запрос и отображение без изменений ...
}

// renderRelicDetails – обновлённые ссылки на вики
function renderRelicDetails(data) {
    // ... начало функции без изменений ...
    html += `</tbody></table>`;
    const searchEn = `https://warframe.fandom.com/wiki/Special:Search?query=${encodeURIComponent(relicName)}`;
    const searchRu = `https://warframe.fandom.com/ru/wiki/Special:Search?query=${encodeURIComponent(relicName)}`;
    html += `<p class="drop-locations">
        <a href="${searchEn}" target="_blank" rel="noopener">Search on EN Wiki ↗</a> &nbsp;|&nbsp;
        <a href="${searchRu}" target="_blank" rel="noopener">Поиск на RU Wiki ↗</a>
    </p>`;
    resultsDiv.innerHTML = html;
    // ... обработчики ...
}