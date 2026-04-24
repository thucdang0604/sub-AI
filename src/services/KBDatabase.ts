/**
 * KBDatabase — Database initialization & utilities for LocalKnowledgeBaseService
 * 
 * Extracted from LocalKnowledgeBaseService.ts (Issue #12 God File refactor)
 * Handles: schema creation, FTS triggers, cosine_similarity UDF
 */

import Database from 'better-sqlite3';

/** Register cosine_similarity UDF for vector search */
export function registerCosineSimilarity(db: Database.Database): void {
    db.function('cosine_similarity', { deterministic: true }, (vecAStr: any, vecBStr: any) => {
        if (!vecAStr || !vecBStr) return 0;
        const a = JSON.parse(vecAStr);
        const b = JSON.parse(vecBStr);
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    });
}

/** Create chunks table + FTS5 virtual table + sync triggers */
export function initChunkTables(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS chunks (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            symbol_name TEXT,
            start_line INTEGER,
            end_line INTEGER,
            code_content TEXT,
            dependencies TEXT,
            summary TEXT,
            embedding TEXT, -- JSON array
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
            file_path,
            symbol_name,
            code_content,
            summary,
            content='chunks',
            content_rowid='rowid'
        );
    `);

    // Triggers to auto-sync FTS when chunks table changes
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO fts_chunks(rowid, file_path, symbol_name, code_content, summary)
            VALUES (new.rowid, new.file_path, new.symbol_name, new.code_content, new.summary);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO fts_chunks(fts_chunks, rowid, file_path, symbol_name, code_content, summary)
            VALUES('delete', old.rowid, old.file_path, old.symbol_name, old.code_content, old.summary);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO fts_chunks(fts_chunks, rowid, file_path, symbol_name, code_content, summary)
            VALUES('delete', old.rowid, old.file_path, old.symbol_name, old.code_content, old.summary);
            INSERT INTO fts_chunks(rowid, file_path, symbol_name, code_content, summary)
            VALUES (new.rowid, new.file_path, new.symbol_name, new.code_content, new.summary);
        END;
    `);
}
