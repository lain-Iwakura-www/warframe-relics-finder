const Fuse = require('fuse.js');
const express = require('express');
const path = require('path');
const Items = require('@wfcd/items');

const CONFIG = {
    PORT: process.env.PORT || 3000,
    MAX_LOAD_ATTEMPTS: 100,
    LOAD_INTERVAL_MS: 100,
    MIN_SEARCH_LENGTH: 3,
    MAX_SEARCH_RESULTS: 500,
};

const DUCATS_BY_RARITY = { Common: 15, Uncommon: 45, Rare: 100 };

let primePartsList = [];
let partToRelicsMap = null;
let partRarityMap = new Map();
let setIndex = new Map();
let relicRewardsMap = new Map();

const PART_SUFFIXES = [
    'Blueprint', 'Neuroptics', 'Chassis', 'Systems',
    'Barrel', 'Receiver', 'Stock',
    'Blade', 'Blades', 'Handle', 'Head', 'Grip', 'Link', 'Gauntlet', 'Gauntlets',
    'Disc', 'Discs', 'Pouch', 'Chain', 'Hilt', 'Guard', 'Ornament',
    'Lower Limb', 'Upper Limb', 'Pod', 'String', 'Stars', 'Collar', 'Band',
    'Kavat', 'Mask', 'Tail', 'Wings', 'Core', 'Carapace', 'Cerebrum',
    'Bow', 'Arrow', 'Quiver',
];
const MULTI_WORD_SUFFIXES = ['Lower Limb', 'Upper Limb'];

function extractSetName(partName) {
    const words = partName.split(' ');
    if (words.length <= 1) return partName;
    let trimmed = partName;
    for (const suffix of MULTI_WORD_SUFFIXES) {
        if (trimmed.endsWith(' ' + suffix)) {
            trimmed = trimmed.slice(0, -(suffix.length + 1));
            break;
        }
    }
    while (true) {
        const lastSpace = trimmed.lastIndexOf(' ');
        if (lastSpace === -1) break;
        const lastWord = trimmed.slice(lastSpace + 1);
        if (PART_SUFFIXES.includes(lastWord)) {
            trimmed = trimmed.slice(0, lastSpace);
        } else {
            break;
        }
    }
    const result = trimmed.trim();
    return result.length > 0 ? result : partName;
}

function buildRelicIndex(items) {
    const map = new Map();
    const primePartsSet = new Set();
    const relics = items.filter(item => item.category === 'Relics');
    const tempRelicMap = new Map();

    for (const relic of relics) {
        if (!Array.isArray(relic.rewards)) continue;
        const baseRelicName = relic.name.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, '');
        if (!tempRelicMap.has(baseRelicName)) {
            tempRelicMap.set(baseRelicName, new Map());
        }
        const relicParts = tempRelicMap.get(baseRelicName);

        for (const reward of relic.rewards) {
            if (!reward?.item?.name || typeof reward.item.name !== 'string') continue;
            const partName = reward.item.name;
            primePartsSet.add(partName);

            if (!partRarityMap.has(partName)) {
                partRarityMap.set(partName, reward.rarity || 'Common');
            }

            if (!map.has(partName)) {
                map.set(partName, []);
            }
            map.get(partName).push({ relic, reward });

            if (!relicParts.has(partName)) {
                relicParts.set(partName, {
                    partName,
                    rarity: reward.rarity || 'Common',
                });
            }
        }
    }

    for (const [relicName, partsMap] of tempRelicMap.entries()) {
        const rewardsList = Array.from(partsMap.values()).map(({ partName, rarity }) => ({
            partName,
            rarity,
            dropChances: calculateDropChances(rarity),
            ducats: DUCATS_BY_RARITY[rarity] || 0,
        }));
        const rarityOrder = { Rare: 1, Uncommon: 2, Common: 3 };
        rewardsList.sort((a, b) => {
            const rDiff = (rarityOrder[a.rarity] || 4) - (rarityOrder[b.rarity] || 4);
            if (rDiff !== 0) return rDiff;
            return a.partName.localeCompare(b.partName);
        });
        relicRewardsMap.set(relicName, rewardsList);
    }

    primePartsList = Array.from(primePartsSet).sort();
    return map;
}

function buildSetIndex() {
    const setMap = new Map();
    for (const partName of primePartsList) {
        const setName = extractSetName(partName);
        if (setName === partName) continue;
        if (!setMap.has(setName)) {
            setMap.set(setName, { mainBlueprint: null, parts: [] });
        }
        const rarity = partRarityMap.get(partName) || 'Common';
        const relicCount = partToRelicsMap.has(partName)
            ? new Set(partToRelicsMap.get(partName).map(e => e.relic.name.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, ''))).size
            : 0;
        setMap.get(setName).parts.push({ name: partName, rarity, relicCount, ducats: DUCATS_BY_RARITY[rarity] || 0 });
        if (partName === setName + ' Blueprint') {
            setMap.get(setName).mainBlueprint = partName;
        }
    }
    for (const setData of setMap.values()) {
        setData.parts.sort((a, b) => a.name.localeCompare(b.name));
    }
    return setMap;
}

function calculateDropChances(rarity) {
    const baseChances = { Common: 0.2533, Uncommon: 0.11, Rare: 0.02 };
    const multipliers = { Intact: 1, Exceptional: 1.5, Flawless: 2, Radiant: 3 };
    const chances = {};
    for (const [refinement, mult] of Object.entries(multipliers)) {
        chances[refinement] = `${(baseChances[rarity] * mult * 100).toFixed(2)}%`;
    }
    return chances;
}

const app = express();
app.use(express.json());
// Запрет кэширования для API
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/prime-parts', (req, res) => {
    if (!primePartsList.length) return res.status(503).json({ error: 'Data is still loading.' });
    res.json({ count: primePartsList.length, parts: primePartsList });
});

app.get('/api/search', (req, res) => {
    if (!primePartsList.length) return res.status(503).json({ error: 'Data is still loading.' });
    const query = req.query.q?.trim();
    if (!query || query.length < CONFIG.MIN_SEARCH_LENGTH)
        return res.status(400).json({ error: `Query must be at least ${CONFIG.MIN_SEARCH_LENGTH} characters long.` });

    // Используем fuse.js для нечёткого поиска
    const fuse = new Fuse(primePartsList, {
        includeScore: true,
        threshold: 0.4,          // 0 – строгое совпадение, 1 – всё подходит. 0.4 допускает небольшие опечатки
        distance: 100,
    });
    const result = fuse.search(query);
    const matched = result.map(r => r.item);
    const limited = matched.slice(0, CONFIG.MAX_SEARCH_RESULTS);
    res.json({ count: matched.length, parts: limited });
});

app.get('/api/search-relics', (req, res) => {
    if (!relicRewardsMap.size) return res.status(503).json({ error: 'Relic index not ready.' });
    const query = req.query.q?.trim().toLowerCase() || '';
    if (!query) return res.json({ relics: [] });

    // Превращаем ключи Map в массив
    const relicNames = Array.from(relicRewardsMap.keys());
    const fuse = new Fuse(relicNames, {
        includeScore: true,
        threshold: 0.4,
        distance: 100,
    });
    const result = fuse.search(query);
    const matched = result.map(r => r.item);
    res.json({ relics: matched.slice(0, 50) });
});

app.get('/api/relics-for-part', (req, res) => {
    if (!partToRelicsMap) return res.status(503).json({ error: 'Relic index not ready yet.' });
    let partName = req.query.part;
    if (!partName) return res.status(400).json({ error: 'Missing "part" query parameter.' });
    try { partName = decodeURIComponent(partName); } catch (e) { return res.status(400).json({ error: 'Invalid encoding.' }); }
    const entries = partToRelicsMap.get(partName);
    if (!entries || entries.length === 0) return res.status(404).json({ error: 'No relics found for this part.' });

    const relics = entries.map(({ relic, reward }) => ({
        name: relic.name,
        tier: relic.tier || relic.era || 'Unknown',
        isVaulted: relic.vaulted === true,
        rarity: reward.rarity || 'Common',
        dropChances: calculateDropChances(reward.rarity || 'Common'),
    }));

    const candidateSet = extractSetName(partName);
    const setName = (candidateSet !== partName && setIndex.has(candidateSet)) ? candidateSet : null;
    const rarity = partRarityMap.get(partName) || 'Common';
    const ducats = DUCATS_BY_RARITY[rarity] || 0;

    res.json({ part: partName, relicCount: relics.length, relics, setName, rarity, ducats });
});

app.get('/api/search-sets', (req, res) => {
    if (!setIndex.size) return res.status(503).json({ error: 'Set index not ready.' });
    const query = req.query.q?.trim().toLowerCase() || '';
    const matched = [];
    for (const setName of setIndex.keys()) {
        if (setName.toLowerCase().includes(query)) {
            matched.push(setName);
            if (matched.length >= 50) break;
        }
    }
    res.json({ sets: matched });
});

app.get('/api/sets', (req, res) => {
    if (!setIndex.size) return res.status(503).json({ error: 'Set index not ready.' });
    const setName = req.query.name?.trim();
    if (!setName) return res.status(400).json({ error: 'Missing "name" query parameter.' });
    const setData = setIndex.get(setName);
    if (!setData) return res.status(404).json({ error: 'Set not found.' });
    res.json({ setName, parts: setData.parts });
});

app.get('/api/relic-details', (req, res) => {
    if (!relicRewardsMap.size) return res.status(503).json({ error: 'Relic rewards index not ready.' });
    const relicName = req.query.relic?.trim();
    if (!relicName) return res.status(400).json({ error: 'Missing "relic" query parameter.' });
    const rewards = relicRewardsMap.get(relicName);
    if (!rewards) return res.status(404).json({ error: 'Relic not found.' });

    let isVaulted = false;
    for (const [, entries] of partToRelicsMap) {
        const entry = entries.find(e => e.relic.name.startsWith(relicName));
        if (entry) { isVaulted = entry.relic.vaulted === true; break; }
    }

    res.json({ relicName, isVaulted, rewards });
});

app.post('/api/optimal-relics', (req, res) => {
    const { parts } = req.body;
    if (!Array.isArray(parts) || parts.length === 0) {
        return res.status(400).json({ error: 'Missing or empty "parts" array.' });
    }
    if (!parts.every(p => typeof p === 'string')) {
        return res.status(400).json({ error: 'All items in "parts" must be strings.' });
    }

    const desiredSet = new Set(parts.map(p => p.toLowerCase()));
    const result = [];

    for (const [relicBaseName, rewards] of relicRewardsMap.entries()) {
        const matched = rewards.filter(r => desiredSet.has(r.partName.toLowerCase()));
        if (matched.length === 0) continue;

        let isVaulted = false;
        for (const reward of matched) {
            const entries = partToRelicsMap.get(reward.partName);
            if (entries) {
                const entry = entries.find(e => e.relic.name.startsWith(relicBaseName));
                if (entry) {
                    isVaulted = entry.relic.vaulted === true;
                    break;
                }
            }
        }

        result.push({
            relic: relicBaseName,
            desiredCount: matched.length,
            desiredParts: matched.map(r => r.partName),
            isVaulted,
        });
    }

    result.sort((a, b) => {
        if (b.desiredCount !== a.desiredCount) return b.desiredCount - a.desiredCount;
        return a.relic.localeCompare(b.relic);
    });

    res.json({ relics: result.slice(0, 50) });
});

async function initializeAndStart(attempt = 0) {
    console.log(`[${new Date().toISOString()}] Loading Warframe data...`);
    let items;
    try {
        items = new Items();
        if (!items.length) {
            if (attempt >= CONFIG.MAX_LOAD_ATTEMPTS) throw new Error('Timeout');
            setTimeout(() => initializeAndStart(attempt + 1), CONFIG.LOAD_INTERVAL_MS);
            return;
        }
    } catch (err) { console.error(err); process.exit(1); }

    partToRelicsMap = buildRelicIndex(items);
    console.log(`Index built. ${primePartsList.length} prime parts.`);
    setIndex = buildSetIndex();
    console.log(`Set index built. ${setIndex.size} sets.`);

    app.listen(CONFIG.PORT, () => console.log(`✅ Server running at http://localhost:${CONFIG.PORT}`));
}

initializeAndStart().catch(err => { console.error(err); process.exit(1); });