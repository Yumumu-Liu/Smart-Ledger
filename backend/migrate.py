from app.database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        try:
            # Check if using SQLite or PostgreSQL
            conn.execute(text("ALTER TABLE transactions ADD COLUMN description VARCHAR;"))
            conn.commit()
            print("Migration successful: Added 'description' column.")
        except Exception as e:
            print(f"Migration error (might already exist or other issue): {e}")

if __name__ == "__main__":
    run_migration()
