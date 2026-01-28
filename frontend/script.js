// Конфигурация
const API_BASE_URL = window.location.origin === 'http://localhost:5000' 
    ? 'http://localhost:5000/api' 
    : '/api';

const config = {
    itemsPerPage: 20,
    currentPage: 1,
    totalPages: 1,
    totalMovies: 0,
    isLoading: false,
    currentFilters: {
        search: '',
        genre: '',
        year: '',
        rating: '',
        sources: ['netflix', 'amazon', 'imdb']
    }
};

// DOM элементы
let moviesGrid, searchInput, searchBtn, genreFilter, yearFilter, ratingFilter;
let prevPageBtn, nextPageBtn, prevPageBtnBottom, nextPageBtnBottom;
let pageInfo, pageInfoBottom, resultsInfo, resetFiltersBtn;
let movieModal, closeModalBtn, movieDetails;
let platformCheckboxes;

// Данные
let allGenres = [];
let stats = {};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initElements();
    setupEventListeners();
    loadInitialData();
    updateFiltersDisplay();
    checkHealth();
});

function initElements() {
    moviesGrid = document.getElementById('movies-grid');
    searchInput = document.getElementById('search-input');
    searchBtn = document.getElementById('search-btn');
    genreFilter = document.getElementById('genre-filter');
    yearFilter = document.getElementById('year-filter');
    ratingFilter = document.getElementById('rating-filter');
    
    prevPageBtn = document.getElementById('prev-page');
    nextPageBtn = document.getElementById('next-page');
    prevPageBtnBottom = document.getElementById('prev-page-bottom');
    nextPageBtnBottom = document.getElementById('next-page-bottom');
    
    pageInfo = document.getElementById('page-info');
    pageInfoBottom = document.getElementById('page-info-bottom');
    resultsInfo = document.getElementById('results-info');
    resetFiltersBtn = document.getElementById('reset-filters');
    
    movieModal = document.getElementById('movie-modal');
    closeModalBtn = document.querySelector('.close-modal');
    movieDetails = document.getElementById('movie-details');
    
    platformCheckboxes = document.querySelectorAll('.platform-checkbox input');
}

function setupEventListeners() {
    // Поиск
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') performSearch();
    });
    
    searchInput.addEventListener('input', function() {
        if (this.value.length >= 2) {
            showSearchSuggestions(this.value);
        } else {
            hideSearchSuggestions();
        }
    });
    
    // Фильтры
    genreFilter.addEventListener('change', applyFilters);
    yearFilter.addEventListener('change', applyFilters);
    ratingFilter.addEventListener('change', applyFilters);
    
    platformCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', applyFilters);
    });
    
    resetFiltersBtn.addEventListener('click', resetFilters);
    
    // Пагинация
    prevPageBtn.addEventListener('click', () => changePage(-1));
    nextPageBtn.addEventListener('click', () => changePage(1));
    prevPageBtnBottom.addEventListener('click', () => changePage(-1));
    nextPageBtnBottom.addEventListener('click', () => changePage(1));
    
    // Модальное окно
    closeModalBtn.addEventListener('click', closeMovieModal);
    movieModal.addEventListener('click', function(e) {
        if (e.target === movieModal) closeMovieModal();
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeMovieModal();
    });
    
    // Обработка ошибок изображений
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG' && e.target.classList.contains('movie-poster')) {
            e.target.onerror = null;
            e.target.src = 'https://via.placeholder.com/300x450/667eea/ffffff?text=Постер+не+найден';
        }
    }, true);
}

// Загрузка начальных данных
async function loadInitialData() {
    showLoading();
    
    try {
        // Загружаем жанры
        const genresResponse = await fetch(`${API_BASE_URL}/genres`);
        const genresData = await genresResponse.json();
        
        if (genresData.success) {
            allGenres = genresData.genres;
            populateGenreFilter();
        }
        
        // Загружаем статистику
        const statsResponse = await fetch(`${API_BASE_URL}/stats`);
        const statsData = await statsResponse.json();
        
        if (statsData.success) {
            stats = statsData.stats;
            updateStatsDisplay();
        }
        
        // Загружаем фильмы
        await loadMovies();
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showError('Не удалось загрузить данные. Проверьте подключение к серверу.');
        showSampleMovies();
    }
}

// Загрузка фильмов
async function loadMovies() {
    if (config.isLoading) return;
    
    config.isLoading = true;
    showLoading();
    
    try {
        // Формируем URL с параметрами
        const params = new URLSearchParams({
            page: config.currentPage,
            per_page: config.itemsPerPage,
            search: config.currentFilters.search,
            genre: config.currentFilters.genre,
            min_rating: config.currentFilters.rating,
            sort_by: 'imdb_rating',
            sort_order: 'DESC'
        });
        
        // Добавляем фильтры по платформам
        config.currentFilters.sources.forEach(source => {
            params.append('sources', source);
        });
        
        // Добавляем фильтры по году
        if (config.currentFilters.year) {
            const [from, to] = config.currentFilters.year.split('-');
            if (from) params.append('year_from', from);
            if (to) params.append('year_to', to);
        }
        
        const response = await fetch(`${API_BASE_URL}/movies?${params}`);
        const data = await response.json();
        
        if (data.success) {
            config.totalMovies = data.total;
            config.totalPages = data.total_pages;
            
            displayMovies(data.movies);
            updatePagination();
            updateResultsInfo();
        } else {
            throw new Error(data.error || 'Неизвестная ошибка');
        }
        
    } catch (error) {
        console.error('Ошибка загрузки фильмов:', error);
        showError('Не удалось загрузить фильмы. Попробуйте позже.');
        showSampleMovies();
    } finally {
        config.isLoading = false;
    }
}

// Отображение фильмов
function displayMovies(movies) {
    if (!movies || movies.length === 0) {
        moviesGrid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-film"></i>
                <h3>Фильмы не найдены</h3>
                <p>Попробуйте изменить параметры поиска</p>
                <button onclick="resetFilters()" class="btn-search">
                    <i class="fas fa-redo"></i> Сбросить фильтры
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    movies.forEach(movie => {
        const rating = movie.imdb_rating || 0;
        const stars = Math.round(rating / 2);
        const starIcons = '★'.repeat(stars) + '☆'.repeat(5 - stars);
        
        // Определяем доступные платформы
        const platforms = movie.sources || [];
        
        // Обрезаем описание если слишком длинное
        const description = movie.description 
            ? (movie.description.length > 100 
                ? movie.description.substring(0, 100) + '...' 
                : movie.description)
            : 'Описание отсутствует';
        
        // Проверяем наличие постера
        const posterUrl = movie.poster_url || 'https://via.placeholder.com/300x450/667eea/ffffff?text=Постер+не+найден';
        
        html += `
            <div class="movie-card" data-id="${movie.id}" onclick="showMovieDetails(${movie.id})">
                <div class="movie-poster-container">
                    <img src="${posterUrl}" 
                         alt="${movie.title}" 
                         class="movie-poster"
                         loading="lazy"
                         onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450/667eea/ffffff?text=Постер+не+найден'">
                    ${rating ? `
                        <div class="movie-rating-badge">
                            <i class="fas fa-star"></i>
                            <span>${rating.toFixed(1)}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="movie-info">
                    <h3 class="movie-title" title="${movie.title}">
                        ${movie.title}
                    </h3>
                    
                    <div class="movie-meta">
                        <span class="movie-year">${movie.release_year || 'Год неизвестен'}</span>
                        ${movie.genre ? `
                            <span class="movie-genre">${movie.genre.split(',')[0]}</span>
                        ` : ''}
                    </div>
                    
                    <div class="movie-platforms">
                        ${platforms.includes('netflix') ? '<span class="source-badge source-netflix">Netflix</span>' : ''}
                        ${platforms.includes('amazon') ? '<span class="source-badge source-amazon">Amazon</span>' : ''}
                        ${platforms.includes('imdb') ? '<span class="source-badge source-imdb">IMDb</span>' : ''}
                    </div>
                    
                    <p class="movie-description">${description}</p>
                    
                    <div class="movie-actions">
                        <button class="btn-details" onclick="event.stopPropagation(); showMovieDetails(${movie.id})">
                            <i class="fas fa-info-circle"></i> Подробнее
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    moviesGrid.innerHTML = html;
    
    // Анимация появления
    setTimeout(() => {
        document.querySelectorAll('.movie-card').forEach((card, index) => {
            card.style.animationDelay = `${index * 0.05}s`;
        });
    }, 100);
}

// Показать детали фильма
async function showMovieDetails(movieId) {
    try {
        showLoadingModal();
        
        const response = await fetch(`${API_BASE_URL}/movies/${movieId}`);
        const data = await response.json();
        
        if (data.success) {
            displayMovieDetails(data.movie);
            movieModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        } else {
            throw new Error(data.error || 'Фильм не найден');
        }
        
    } catch (error) {
        console.error('Ошибка загрузки деталей фильма:', error);
        showError('Не удалось загрузить информацию о фильме');
    }
}

function displayMovieDetails(movie) {
    const rating = movie.imdb_rating || 0;
    const platforms = movie.sources || [];
    
    let platformsHtml = '';
    if (platforms.includes('netflix') && movie.netflix_id) {
        platformsHtml += `
            <a href="https://www.netflix.com/title/${movie.netflix_id}" 
               target="_blank" 
               class="platform-link netflix">
                <i class="fab fa-netflix"></i>
                Смотреть на Netflix
            </a>
        `;
    }
    
    if (platforms.includes('amazon') && movie.amazon_id) {
        platformsHtml += `
            <a href="https://www.primevideo.com/detail/${movie.amazon_id}" 
               target="_blank" 
               class="platform-link amazon">
                <i class="fab fa-amazon"></i>
                Смотреть на Amazon Prime
            </a>
        `;
    }
    
    if (platforms.includes('imdb') && movie.imdb_id) {
        platformsHtml += `
            <a href="https://www.imdb.com/title/${movie.imdb_id}" 
               target="_blank" 
               class="platform-link imdb">
                <i class="fab fa-imdb"></i>
                Открыть в IMDb
            </a>
        `;
    }
    
    movieDetails.innerHTML = `
        <div class="movie-details-header">
            <img src="${movie.poster_url || 'https://via.placeholder.com/800x450/667eea/ffffff?text=Постер+не+найден'}" 
                 alt="${movie.title}" 
                 class="movie-details-backdrop"
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/800x450/667eea/ffffff?text=Постер+не+найден'">
            
            <div class="movie-details-overlay">
                <img src="${movie.poster_url || 'https://via.placeholder.com/200x300/667eea/ffffff?text=Постер+не+найден'}" 
                     alt="${movie.title}" 
                     class="movie-details-poster"
                     onerror="this.onerror=null; this.src='https://via.placeholder.com/200x300/667eea/ffffff?text=Постер+не+найден'">
                
                <div class="movie-details-title">
                    <h2>${movie.title}</h2>
                    <div class="movie-details-meta">
                        ${movie.release_year ? `<span class="year">${movie.release_year}</span>` : ''}
                        ${rating ? `
                            <div class="rating-details">
                                <i class="fas fa-star"></i>
                                <span class="rating-value">${rating.toFixed(1)}</span>
                                <span class="rating-label">IMDb</span>
                            </div>
                        ` : ''}
                        ${movie.duration ? `<span class="duration">${movie.duration}</span>` : ''}
                    </div>
                    ${movie.genre ? `<div class="genres">${movie.genre}</div>` : ''}
                </div>
            </div>
        </div>
        
        <div class="movie-details-body">
            <div class="movie-details-section">
                <h3>Описание</h3>
                <p class="movie-description">${movie.description || 'Описание отсутствует'}</p>
            </div>
            
            ${movie.cast || movie.netflix_cast || movie.amazon_cast ? `
                <div class="movie-details-section">
                    <h3>В ролях</h3>
                    <p class="movie-cast">${movie.cast || movie.netflix_cast || movie.amazon_cast || 'Информация отсутствует'}</p>
                </div>
            ` : ''}
            
            ${movie.director || movie.netflix_director || movie.amazon_director ? `
                <div class="movie-details-section">
                    <h3>Режиссёр</h3>
                    <p>${movie.director || movie.netflix_director || movie.amazon_director}</p>
                </div>
            ` : ''}
            
            ${platformsHtml ? `
                <div class="movie-details-section">
                    <h3>Где смотреть</h3>
                    <div class="movie-platforms-details">
                        ${platformsHtml}
                    </div>
                </div>
            ` : ''}
            
            ${movie.language ? `
                <div class="movie-details-section">
                    <h3>Язык</h3>
                    <p>${movie.language}</p>
                </div>
            ` : ''}
        </div>
    `;
}

// Закрыть модальное окно
function closeMovieModal() {
    movieModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Поиск
function performSearch() {
    config.currentFilters.search = searchInput.value.trim();
    config.currentPage = 1;
    loadMovies();
    hideSearchSuggestions();
}

async function showSearchSuggestions(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/search/suggestions?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        const suggestionsDiv = document.getElementById('search-suggestions');
        
        if (data.success && data.suggestions.length > 0) {
            suggestionsDiv.innerHTML = data.suggestions.map(movie => `
                <div class="suggestion-item" onclick="selectSuggestion('${movie.title}')">
                    <strong>${movie.title}</strong>
                    ${movie.year ? `<span class="suggestion-year">(${movie.year})</span>` : ''}
                </div>
            `).join('');
            suggestionsDiv.style.display = 'block';
        } else {
            suggestionsDiv.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка загрузки подсказок:', error);
    }
}

function hideSearchSuggestions() {
    const suggestionsDiv = document.getElementById('search-suggestions');
    suggestionsDiv.style.display = 'none';
}

function selectSuggestion(title) {
    searchInput.value = title;
    performSearch();
}

// Фильтры
function applyFilters() {
    config.currentPage = 1;
    
    config.currentFilters.genre = genreFilter.value;
    config.currentFilters.year = yearFilter.value;
    config.currentFilters.rating = ratingFilter.value;
    
    // Получаем выбранные платформы
    config.currentFilters.sources = [];
    platformCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            config.currentFilters.sources.push(checkbox.value);
        }
    });
    
    loadMovies();
    updateFiltersDisplay();
}

function resetFilters() {
    searchInput.value = '';
    genreFilter.value = '';
    yearFilter.value = '';
    ratingFilter.value = '';
    
    platformCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    
    config.currentFilters = {
        search: '',
        genre: '',
        year: '',
        rating: '',
        sources: ['netflix', 'amazon', 'imdb']
    };
    
    config.currentPage = 1;
    loadMovies();
    updateFiltersDisplay();
}

function updateFiltersDisplay() {
    // Обновляем отображение активных фильтров
    const activeFilters = [];
    
    if (config.currentFilters.search) {
        activeFilters.push(`Поиск: "${config.currentFilters.search}"`);
    }
    
    if (config.currentFilters.genre) {
        activeFilters.push(`Жанр: ${config.currentFilters.genre}`);
    }
    
    if (config.currentFilters.year) {
        activeFilters.push(`Годы: ${config.currentFilters.year}`);
    }
    
    if (config.currentFilters.rating) {
        activeFilters.push(`Рейтинг: ${config.currentFilters.rating}+`);
    }
    
    // Показываем количество выбранных платформ
    const selectedPlatforms = config.currentFilters.sources.length;
    if (selectedPlatforms < 3) {
        activeFilters.push(`Платформы: ${selectedPlatforms} из 3`);
    }
    
    // Можно добавить отображение активных фильтров в интерфейсе
}

// Пагинация
function changePage(delta) {
    const newPage = config.currentPage + delta;
    
    if (newPage >= 1 && newPage <= config.totalPages) {
        config.currentPage = newPage;
        loadMovies();
        
        // Прокрутка к верху
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

function updatePagination() {
    const hasPrev = config.currentPage > 1;
    const hasNext = config.currentPage < config.totalPages;
    
    prevPageBtn.disabled = !hasPrev;
    nextPageBtn.disabled = !hasNext;
    prevPageBtnBottom.disabled = !hasPrev;
    nextPageBtnBottom.disabled = !hasNext;
    
    pageInfo.textContent = `Страница ${config.currentPage} из ${config.totalPages}`;
    pageInfoBottom.textContent = `Страница ${config.currentPage} из ${config.totalPages}`;
}

function updateResultsInfo() {
    const start = (config.currentPage - 1) * config.itemsPerPage + 1;
    const end = Math.min(config.currentPage * config.itemsPerPage, config.totalMovies);
    
    resultsInfo.textContent = `Показано ${start}-${end} из ${config.totalMovies} фильмов`;
}

// Заполнение фильтра жанров
function populateGenreFilter() {
    if (!allGenres.length) return;
    
    let html = '<option value="">Все жанры</option>';
    
    allGenres.forEach(genre => {
        if (genre && genre.trim()) {
            html += `<option value="${genre}">${genre}</option>`;
        }
    });
    
    genreFilter.innerHTML = html;
}

// Обновление статистики
function updateStatsDisplay() {
    document.getElementById('movies-count').textContent = stats.total_movies || '1000+';
    
    if (stats.average_rating) {
        document.getElementById('avg-rating').textContent = stats.average_rating.toFixed(1);
    }
}

// Проверка здоровья сервера
async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        const data = await response.json();
        
        if (data.status === 'healthy') {
            console.log('✅ Сервер работает, фильмов:', data.movies_count);
        } else {
            showError('Проблемы с сервером');
        }
    } catch (error) {
        console.warn('Сервер недоступен, работаем в офлайн режиме');
        showOfflineWarning();
    }
}

// Вспомогательные функции
function showLoading() {
    moviesGrid.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Загрузка фильмов...</p>
        </div>
    `;
}

function showLoadingModal() {
    movieDetails.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Загрузка информации о фильме...</p>
        </div>
    `;
}

function showError(message) {
    // Можно добавить уведомление
    console.error('Ошибка:', message);
    
    const notification = document.createElement('div');
    notification.className = 'notification error show';
    notification.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function showOfflineWarning() {
    const warning = document.createElement('div');
    warning.className = 'offline-mode';
    warning.innerHTML = `
        <i class="fas fa-wifi-slash"></i>
        <span>Офлайн режим. Данные могут быть устаревшими.</span>
    `;
    
    document.body.appendChild(warning);
    
    setTimeout(() => {
        warning.remove();
    }, 10000);
}

// Примерные фильмы для демонстрации
function showSampleMovies() {
    const sampleMovies = [
        {
            id: 1,
            title: "Начало",
            release_year: 2010,
            imdb_rating: 8.8,
            genre: "Научная фантастика, Триллер",
            description: "Специалист по кражам снов Кобб получает шанс искупить вину...",
            poster_url: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg",
            sources: ["imdb", "netflix"]
        },
        {
            id: 2,
            title: "Интерстеллар",
            release_year: 2014,
            imdb_rating: 8.6,
            genre: "Драма, Приключения",
            description: "Фермер и бывший пилот НАСА Купер отправляется в космическое путешествие...",
            poster_url: "https://m.media-amazon.com/images/M/MV5BZjdkOTU3MDktN2IxOS00OGEyLWFmMjktY2FiMmZkNWIyODZiXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg",
            sources: ["imdb", "amazon"]
        }
    ];
    
    displayMovies(sampleMovies);
    resultsInfo.textContent = "Демо режим: показаны примеры фильмов";
}

// Экспорт функций в глобальную область видимости
window.showMovieDetails = showMovieDetails;
window.closeMovieModal = closeMovieModal;
window.resetFilters = resetFilters;
window.selectSuggestion = selectSuggestion;
window.performSearch = performSearch;

// Добавляем стили для новых элементов
const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    .movie-poster-container {
        position: relative;
    }
    
    .movie-rating-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #ffd700;
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.9rem;
    }
    
    .movie-meta {
        display: flex;
        gap: 0.8rem;
        margin-bottom: 0.8rem;
        font-size: 0.9rem;
        color: var(--light-text);
    }
    
    .movie-description {
        font-size: 0.9rem;
        line-height: 1.5;
        color: var(--text-color);
        margin-bottom: 1rem;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    
    .movie-actions {
        margin-top: auto;
    }
    
    .btn-details {
        width: 100%;
        padding: 0.6rem;
        background: var(--primary-color);
        color: white;
        border: none;
        border-radius: var(--radius);
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }
    
    .btn-details:hover {
        background: #c40812;
        transform: translateY(-2px);
    }
    
    .no-results {
        grid-column: 1 / -1;
        text-align: center;
        padding: 4rem 2rem;
        color: var(--light-text);
    }
    
    .no-results i {
        font-size: 4rem;
        margin-bottom: 1rem;
        opacity: 0.5;
    }
    
    .no-results h3 {
        margin-bottom: 0.5rem;
        color: var(--text-color);
    }
    
    .no-results p {
        margin-bottom: 2rem;
    }
    
    .rating-details {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(0, 0, 0, 0.7);
        padding: 0.3rem 0.8rem;
        border-radius: 20px;
        color: white;
    }
    
    .rating-details .rating-value {
        font-weight: bold;
        color: #ffd700;
    }
    
    .movie-platforms-details {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
    }
    
    .movie-details-section h3 {
        color: var(--text-color);
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid var(--accent-color);
    }
    
    .movie-cast {
        line-height: 1.6;
        color: var(--text-color);
    }
`;
document.head.appendChild(additionalStyles);