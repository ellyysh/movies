import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / 'data'
csv_file = DATA_DIR / 'integrated_movies_with_posters.csv'

print(f"📁 Проверяю файл: {csv_file}")
print(f"Файл существует: {csv_file.exists()}")

if csv_file.exists():
    try:
        df = pd.read_csv(csv_file, encoding='utf-8-sig')
        print(f"✅ CSV прочитан успешно!")
        print(f"Размер: {len(df)} строк, {len(df.columns)} колонок")
        print("\nКолонки:")
        for col in df.columns:
            print(f"  - {col}")
        
        print(f"\nПервые 3 фильма:")
        for i, row in df.head(3).iterrows():
            print(f"\n{i+1}. {row.get('title', 'Без названия')}")
            print(f"   Год: {row.get('release_year', 'Нет')}")
            print(f"   Рейтинг: {row.get('imdb_rating', 'Нет')}")
            print(f"   Постер: {'Есть' if pd.notna(row.get('poster_url')) else 'Нет'}")
        
    except Exception as e:
        print(f"❌ Ошибка чтения CSV: {e}")
        import traceback
        print(traceback.format_exc())
else:
    print("❌ Файл не найден!")
    print(f"Искал в: {DATA_DIR}")
    print("Файлы в папке data/:")
    data_dir = Path('data')
    if data_dir.exists():
        for file in data_dir.iterdir():
            print(f"  - {file.name}")