const TRANSLATIONS = {
    en: {
        title: 'Warframe Relic Finder',
        searchPlaceholder: 'Enter part or relic name (min. 3 chars)...',
        wishlistTitle: 'Wishlist',
        nothingAdded: 'Nothing added yet.',
        sort: 'Sort:',
        sortAdded: 'Date added',
        sortName: 'Name',
        sortObtained: 'Owned status',
        findBestRelics: '🔍 Find Best Relics',
        loading: 'Loading...',
        error: 'Error',
        setNotFound: 'Set not found',
        partNotFound: 'No relics found.',
        relicNotFound: 'Relic not found.',
        loadingSet: 'Loading set...',
        loadingPart: 'Loading...',
        loadingRelic: 'Loading...',
        back: '← Back',
        addToWishlist: '➕ Add to wishlist',
        removeFromWishlist: '❌ Remove from wishlist',
        addSet: '➕ Add set',
        removeSet: '❌ Remove set',
        rarity: 'Rarity:',
        ducats: 'ducats',
        platinumNA: 'platinum N/A',
        showAvailableOnly: 'Show available only',
        relic: 'Relic',
        status: 'Status',
        vaulted: 'Vaulted',
        available: 'Available',
        resurgence: 'Resurgence',
        reward: 'Reward',
        intact: 'Intact',
        exceptional: 'Exceptional',
        flawless: 'Flawless',
        radiant: 'Radiant',
        owned: 'Owned',
        delete: 'Remove',
        deleteSet: 'Remove set',
        searchEnWiki: 'Search on EN Wiki ↗',
        searchRuWiki: 'Поиск на RU Wiki ↗',
        feedback: 'Feedback & Issues',
        disclaimer: 'Warframe and all related content are trademarks of Digital Extremes. This is a fan-made project, not affiliated with DE.',
        officialSite: 'Official Warframe Site',
        part: 'Part',
        relics: 'Relics',
        missingParts: 'Missing Parts',
        count: 'Count',
        allObtained: 'All parts obtained! Nothing to search.',
        bestRelicsTitle: '🎯 Best Relics for Your Missing Parts',
        findBest: 'Finding best relics...',
    },
    ru: {
        title: 'Warframe Relic Finder',
        searchPlaceholder: 'Введите название части или реликвии (мин. 3 симв.)...',
        wishlistTitle: 'Список желаемого',
        nothingAdded: 'Пока ничего не добавлено.',
        sort: 'Сортировка:',
        sortAdded: 'По дате',
        sortName: 'По алфавиту',
        sortObtained: 'По получению',
        findBestRelics: '🔍 Найти лучшие реликвии',
        loading: 'Загрузка...',
        error: 'Ошибка',
        setNotFound: 'Набор не найден',
        partNotFound: 'Реликвии не найдены.',
        relicNotFound: 'Реликвия не найдена.',
        loadingSet: 'Загрузка набора...',
        loadingPart: 'Загрузка...',
        loadingRelic: 'Загрузка...',
        back: '← Назад',
        addToWishlist: '➕ Добавить в желаемое',
        removeFromWishlist: '❌ Убрать из желаемого',
        addSet: '➕ Добавить набор',
        removeSet: '❌ Убрать набор',
        rarity: 'Редкость:',
        ducats: 'Дукатов',
        platinumNA: 'Платина N/A',
        showAvailableOnly: 'Только доступные',
        relic: 'Реликвия',
        status: 'Статус',
        vaulted: 'В хранилище',
        available: 'Доступна',
        resurgence: 'Возрождение',
        reward: 'Награда',
        intact: 'Нетронутая',
        exceptional: 'Необычная',
        flawless: 'Бесподобная',
        radiant: 'Сияющая',
        owned: 'Получено',
        delete: 'Удалить',
        deleteSet: 'Удалить набор',
        searchEnWiki: 'Искать на EN Wiki ↗',
        searchRuWiki: 'Искать на RU Wiki ↗',
        feedback: 'Обратная связь',
        disclaimer: 'Warframe и связанный контент — собственность Digital Extremes. Это фанатский проект, не аффилированный с DE.',
        officialSite: 'Официальный сайт Warframe',
        part: 'Деталь',
        relics: 'Реликвий',
        missingParts: 'Отсутствующие части',
        count: 'Кол-во',
        allObtained: 'Все детали получены! Нечего искать.',
        bestRelicsTitle: '🎯 Лучшие реликвии для недостающих деталей',
        findBest: 'Поиск лучших реликвий...',
    }
};

let currentLang = localStorage.getItem('lang') || 'en';

function t(key) {
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en[key] || key;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyLanguage();
    renderWishlist();           // обновить интерфейс списка
    if (currentState) refreshCurrentPage(); // обновить текущий контент
}

function applyLanguage() {
    document.title = t('title');
    document.getElementById('searchInput').placeholder = t('searchPlaceholder');
    document.querySelector('.wishlist-section h2').textContent = '📋 ' + t('wishlistTitle');
    // Обновим флаги активного языка (если добавим)
}