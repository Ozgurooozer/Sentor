use rusqlite::{params, Connection, Result};
use std::path::Path;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        // Notlar tablosu
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                updated_at INTEGER NOT NULL,
                indexed_at INTEGER
            )",
            [],
        )?;

        // Wiki-linkler tablosu (Backlink takibi için)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS links (
                source_id TEXT NOT NULL,
                target_title TEXT NOT NULL,
                FOREIGN KEY(source_id) REFERENCES notes(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Tam metin arama (FTS5)
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                title,
                content,
                content='notes',
                content_rowid='rowid'
            )",
            [],
        )?;

        // Vektör depolama (Basit bir tablo, semantik arama için)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS embeddings (
                note_id TEXT PRIMARY KEY,
                vector BLOB NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
            )",
            [],
        )?;

        Ok(())
    }

    pub fn upsert_note(&self, id: &str, path: &str, title: &str, content: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO notes (id, path, title, content, updated_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%s','now'))
             ON CONFLICT(path) DO UPDATE SET
                title=excluded.title,
                content=excluded.content,
                updated_at=excluded.updated_at",
            params![id, path, title, content],
        )?;
        Ok(())
    }

    pub fn search_notes(&self, query: &str) -> Result<Vec<(String, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT title, path FROM notes_fts WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT 20",
        )?;
        let rows = stmt.query_map(params![query], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}
