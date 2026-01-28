from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import json
import os
from pathlib import Path
from datetime import datetime
import pandas as pd
import csv
import sqlite3
import re

def load_sql_file(sql_file_path):
    """Загружает SQL файл и выполняет все запросы"""
    try:
        with open(sql_file_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # Удаляем комментарии
        sql_content = re.sub(r'--.*', '', sql_content)
        sql_content = re.sub(r'/\*.*?\*/', '', sql_content, flags=re.DOTALL)
        
        # Разделяем на отдельные запросы
        queries = [q.strip() for q in sql_content.split(';') if q.strip()]
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        for query in queries:
            try:
                cursor.execute(query)
            except sqlite3.Error as e:
                print(f"⚠️  Ошибка выполнения запроса: {e}")
                print(f"Запрос: {query[:100]}...")
        
        conn.commit()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка загрузки SQL файла: {e}")
        return False
app = Flask(__name__)
CORS(app)

# Пути
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / 'database' / 'movies.db'
DATA_DIR = BASE_DIR.parent / 'data'
FRONTEND_DIR = BASE_DIR.parent / 'frontend'

# Создаём БД при старте если нет
def init_database():
    """Создаёт базу данных и таблицы если их нет"""
    
    # Создаём папки если их нет
    DB_PATH.parent.mkdir(exist_ok=True)
    DATA_DIR.mkdir(exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Создаём таблицу movies если её нет
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canonical_key TEXT UNIQUE,
            title TEXT NOT NULL,
            release_year INTEGER,
            imdb_rating REAL,
            imdb_votes INTEGER,
            genre TEXT,
            description TEXT,
            poster_url TEXT NOT NULL,
            language TEXT,
            imdb_id TEXT,
            sources TEXT,
            num_sources INTEGER,
            netflix_id TEXT,
            netflix_director TEXT,
            netflix_cast TEXT,
            netflix_country TEXT,
            netflix_date_added TEXT,
            netflix_rating TEXT,
            netflix_duration TEXT,
            netflix_listed_in TEXT,
            amazon_id TEXT,
            amazon_director TEXT,
            amazon_cast TEXT,
            amazon_country TEXT,
            amazon_date_added TEXT,
            amazon_rating TEXT,
            amazon_duration TEXT,
            amazon_listed_in TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Создаём индексы
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_title ON movies(title)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_year ON movies(release_year)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rating ON movies(imdb_rating)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sources ON movies(num_sources)")
    
    conn.commit()
    conn.close()
    
    # Проверяем есть ли данные
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM movies")
    count = cursor.fetchone()[0]
    conn.close()
    
    print(f"📊 Начальное состояние базы: {count} фильмов")
    
    if count == 0:
        print("📦 База данных пуста, ищу данные для загрузки...")
        
        # Список возможных файлов с данными
        possible_files = [
            # SQL файлы
            DATA_DIR / 'movies.sql',
            DATA_DIR / 'database.sql',
            DATA_DIR / 'data.sql',
            BASE_DIR.parent / 'movies.sql',
            BASE_DIR.parent / 'database.sql',
            BASE_DIR.parent / 'data.sql',
            
            # CSV файлы
            DATA_DIR / 'integrated_movies_with_posters.csv',
            DATA_DIR / 'integrated_movies.csv',
            BASE_DIR.parent / 'integrated_movies_with_posters.csv',
            BASE_DIR.parent / 'integrated_movies.csv',
        ]
        
        data_loaded = False
        
        for data_file in possible_files:
            if data_file.exists():
                print(f"📁 Найден файл: {data_file}")
                
                if data_file.suffix.lower() == '.sql':
                    print(f"   Загружаю SQL файл...")
                    if load_sql_file(data_file):
                        data_loaded = True
                        break
                
                elif data_file.suffix.lower() == '.csv':
                    print(f"   Загружаю CSV файл...")
                    try:
                        df = pd.read_csv(data_file, encoding='utf-8-sig')
                        conn = sqlite3.connect(DB_PATH)
                        df.to_sql('movies', conn, if_exists='append', index=False)
                        conn.commit()
                        conn.close()
                        print(f"✅ Загружено {len(df)} фильмов из CSV")
                        data_loaded = True
                        break
                    except Exception as e:
                        print(f"❌ Ошибка загрузки CSV: {e}")
        
        # Если не нашли файлы данных, создаём тестовые
        if not data_loaded:
            print("⚠️  Файлы данных не найдены, создаю тестовую базу...")
            
    
    # Проверяем финальное количество
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM movies")
    final_count = cursor.fetchone()[0]
    conn.close()
    
    print(f"✅ База данных готова: {final_count} фильмов")
    return True

# Подключение к БД
def get_db_connection():
    """Создаёт подключение к БД"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Возвращает словари
    return conn

# API Роуты
@app.route('/api/movies', methods=['GET'])
# Более надёжный способ создания COUNT запроса
def get_movies():
    """Получить все фильмы с пагинацией и фильтрацией"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Параметры запроса
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        offset = (page - 1) * per_page
        
        # Базовый запрос для данных
        query = """
            SELECT id, canonical_key, title, release_year, 
                   imdb_rating, genre, description, poster_url, 
                   sources, num_sources,
                   netflix_id, amazon_id, imdb_id
            FROM movies 
            WHERE 1=1
        """
        
        # Базовый запрос для подсчёта
        count_query = """
            SELECT COUNT(*) as total
            FROM movies 
            WHERE 1=1
        """
        
        params = []
        count_params = []
        
        # Фильтры
        search = request.args.get('search', '').strip()
        if search:
            where_clause = " AND (title LIKE ? OR description LIKE ? OR genre LIKE ?)"
            search_term = f"%{search}%"
            query += where_clause
            count_query += where_clause
            params.extend([search_term, search_term, search_term])
            count_params.extend([search_term, search_term, search_term])
        
        genre = request.args.get('genre', '').strip()
        if genre:
            where_clause = " AND genre LIKE ?"
            query += where_clause
            count_query += where_clause
            params.append(f"%{genre}%")
            count_params.append(f"%{genre}%")
        
        year_from = request.args.get('year_from', '').strip()
        if year_from:
            where_clause = " AND release_year >= ?"
            query += where_clause
            count_query += where_clause
            params.append(int(year_from))
            count_params.append(int(year_from))
        
        year_to = request.args.get('year_to', '').strip()
        if year_to:
            where_clause = " AND release_year <= ?"
            query += where_clause
            count_query += where_clause
            params.append(int(year_to))
            count_params.append(int(year_to))
        
        min_rating = request.args.get('min_rating', '').strip()
        if min_rating:
            where_clause = " AND imdb_rating >= ?"
            query += where_clause
            count_query += where_clause
            params.append(float(min_rating))
            count_params.append(float(min_rating))
        
        # Фильтр по платформам
        platforms = request.args.getlist('sources')
        if platforms:
            platform_conditions = []
            for platform in platforms:
                if platform == 'netflix':
                    platform_conditions.append("netflix_id IS NOT NULL AND netflix_id != ''")
                elif platform == 'amazon':
                    platform_conditions.append("amazon_id IS NOT NULL AND amazon_id != ''")
                elif platform == 'imdb':
                    platform_conditions.append("poster_url IS NOT NULL AND poster_url != ''")
            
            if platform_conditions:
                where_clause = " AND (" + " OR ".join(platform_conditions) + ")"
                query += where_clause
                count_query += where_clause
                # Для фильтров платформ параметры не нужны
        
        # Получаем общее количество
        print(f"🔍 COUNT Query: {count_query}")
        print(f"🔍 COUNT Params: {count_params}")
        
        cursor.execute(count_query, count_params)
        result = cursor.fetchone()
        
        # Исправляем получение значения total
        if result and len(result) > 0:
            total = result[0]  # Получаем по индексу
        else:
            total = 0
        
        # Сортировка
        sort_by = request.args.get('sort_by', 'imdb_rating')
        sort_order = request.args.get('sort_order', 'DESC')
        
        valid_sort_fields = ['title', 'release_year', 'imdb_rating', 'num_sources']
        if sort_by in valid_sort_fields:
            query += f" ORDER BY {sort_by} {sort_order}"
        else:
            query += " ORDER BY imdb_rating DESC"
        
        # Пагинация
        query += " LIMIT ? OFFSET ?"
        params.extend([per_page, offset])
        
        print(f"🔍 Main Query: {query}")
        print(f"🔍 Main Params: {params}")
        
        # Выполняем запрос
        cursor.execute(query, params)
        movies = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        # Форматируем источники
        for movie in movies:
            if movie.get('sources'):
                movie['sources'] = movie['sources'].split(',')
            else:
                # Определяем источники по наличию данных
                sources = []
                if movie.get('netflix_id'):
                    sources.append('netflix')
                if movie.get('amazon_id'):
                    sources.append('amazon')
                if movie.get('poster_url'):
                    sources.append('imdb')
                movie['sources'] = sources
                movie['num_sources'] = len(sources) or 1
            
            # Гарантируем наличие постера
            if not movie.get('poster_url'):
                movie['poster_url'] = 'https://via.placeholder.com/300x450/667eea/ffffff?text=Постер+не+найден'
            
            # Гарантируем наличие рейтинга
            if movie.get('imdb_rating') is None:
                movie['imdb_rating'] = 0
        
        return jsonify({
            'success': True,
            'movies': movies,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': max(1, (total + per_page - 1) // per_page)
        })
    
    except Exception as e:
        print(f"❌ Ошибка в get_movies: {e}")
        import traceback
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
@app.route('/api/movies/<int:movie_id>', methods=['GET'])
def get_movie(movie_id):
    """Получить детальную информацию о фильме"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT * FROM movies WHERE id = ?
        """
        cursor.execute(query, (movie_id,))
        movie = cursor.fetchone()
        
        conn.close()
        
        if movie:
            movie_dict = dict(movie)
            
            # Форматируем источники
            if movie_dict.get('sources'):
                movie_dict['sources'] = movie_dict['sources'].split(',')
            else:
                sources = []
                if movie_dict.get('netflix_id'):
                    sources.append('netflix')
                if movie_dict.get('amazon_id'):
                    sources.append('amazon')
                if movie_dict.get('poster_url'):
                    sources.append('imdb')
                movie_dict['sources'] = sources
            
            # Гарантируем наличие постера
            if not movie_dict.get('poster_url'):
                movie_dict['poster_url'] = 'https://via.placeholder.com/300x450/667eea/ffffff?text=Постер+не+найден'
            
            return jsonify({
                'success': True,
                'movie': movie_dict
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Фильм не найден'
            }), 404
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/genres', methods=['GET'])
def get_genres():
    """Получить список всех жанров"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Получаем все уникальные жанры
        cursor.execute("""
            SELECT DISTINCT genre FROM movies WHERE genre IS NOT NULL AND genre != ''
        """)
        
        all_genres = set()
        for row in cursor.fetchall():
            if row['genre']:
                # Разделяем жанры через запятую
                genres = [g.strip() for g in row['genre'].split(',')]
                all_genres.update(genres)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'genres': sorted(list(all_genres))
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Получить статистику по фильмам"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Общее количество
        cursor.execute("SELECT COUNT(*) as total FROM movies")
        total = cursor.fetchone()['total']
        
        # Статистика по годам
        cursor.execute("""
            SELECT MIN(release_year) as min_year, 
                   MAX(release_year) as max_year,
                   AVG(imdb_rating) as avg_rating
            FROM movies
            WHERE release_year IS NOT NULL AND imdb_rating IS NOT NULL
        """)
        stats = cursor.fetchone()
        
        # Количество фильмов на платформах
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN netflix_id IS NOT NULL AND netflix_id != '' THEN 1 ELSE 0 END) as netflix_count,
                SUM(CASE WHEN amazon_id IS NOT NULL AND amazon_id != '' THEN 1 ELSE 0 END) as amazon_count,
                SUM(CASE WHEN poster_url IS NOT NULL AND poster_url != '' THEN 1 ELSE 0 END) as imdb_count
            FROM movies
        """)
        platform_stats = cursor.fetchone()
        
        conn.close()
        
        return jsonify({
            'success': True,
            'stats': {
                'total_movies': total,
                'year_range': {
                    'min': stats['min_year'],
                    'max': stats['max_year']
                },
                'average_rating': round(stats['avg_rating'] or 0, 2),
                'platforms': {
                    'netflix': platform_stats['netflix_count'],
                    'amazon': platform_stats['amazon_count'],
                    'imdb': platform_stats['imdb_count']
                }
            }
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/search/suggestions', methods=['GET'])
def get_search_suggestions():
    """Получить подсказки для поиска"""
    try:
        query = request.args.get('q', '').strip().lower()
        if not query or len(query) < 2:
            return jsonify({
                'success': True,
                'suggestions': []
            })
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        search_query = """
            SELECT id, title, release_year 
            FROM movies 
            WHERE title LIKE ? 
            ORDER BY imdb_rating DESC 
            LIMIT 10
        """
        
        cursor.execute(search_query, (f"%{query}%",))
        suggestions = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'suggestions': suggestions
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Загрузка данных из CSV
@app.route('/api/admin/load-csv', methods=['POST'])
def load_csv():
    """Загрузить данные из CSV файла (админская функция)"""
    try:
        # Проверяем наличие файла
        csv_file = DATA_DIR / 'integrated_movies_with_posters.csv'
        if not csv_file.exists():
            return jsonify({
                'success': False,
                'error': 'CSV файл не найден'
            }), 404
        
        # Читаем CSV
        df = pd.read_csv(csv_file, encoding='utf-8-sig')
        
        # Подключаемся к БД
        conn = sqlite3.connect(DB_PATH)
        
        # Очищаем таблицу
        cursor = conn.cursor()
        cursor.execute("DELETE FROM movies")
        conn.commit()
        
        # Загружаем данные
        df.to_sql('movies', conn, if_exists='append', index=False)
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': f'Загружено {len(df)} фильмов',
            'count': len(df)
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Экспорт данных в CSV
@app.route('/api/admin/export-csv', methods=['GET'])
def export_csv():
    """Экспортировать данные в CSV файл"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Получаем все фильмы
        cursor.execute("SELECT * FROM movies")
        movies = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        if not movies:
            return jsonify({
                'success': False,
                'error': 'Нет данных для экспорта'
            }), 404
        
        # Создаём CSV
        csv_file = DATA_DIR / 'exported_movies.csv'
        df = pd.DataFrame(movies)
        df.to_csv(csv_file, index=False, encoding='utf-8-sig')
        
        return jsonify({
            'success': True,
            'message': f'Экспортировано {len(movies)} фильмов',
            'file': str(csv_file),
            'count': len(movies)
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Статические файлы фронтенда
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    """Обслуживание фронтенда"""
    if path and os.path.exists(FRONTEND_DIR / path):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/health', methods=['GET'])
def health_check():
    """Проверка здоровья сервера"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM movies")
        count = cursor.fetchone()['count']
        conn.close()
        
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'movies_count': count,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500

# Запуск приложения
if __name__ == '__main__':
    print("=" * 60)
    print("🎬 КИНОТЕКА - Запуск сервера")
    print("=" * 60)
    
    # Создаём папки если их нет
    FRONTEND_DIR.mkdir(exist_ok=True)
    
    # Инициализируем БД
    print("🔧 Инициализация базы данных...")
    init_database()
    
    print("\n✅ Сервер готов!")
    print(f"📊 База данных: {DB_PATH}")
    print(f"🌐 Сервер запущен: http://localhost:5000")
    print(f"📱 Фронтенд: http://localhost:5000")
    print(f"🔧 API доступен по: http://localhost:5000/api/movies")
    print(f"❤️  Проверка здоровья: http://localhost:5000/health")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)