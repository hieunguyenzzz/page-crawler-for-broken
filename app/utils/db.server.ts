import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory name in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use environment variable for data dir or default to local path
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  console.log(`Creating data directory: ${DATA_DIR}`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'service-monitoring.db');
console.log(`Database will be stored at: ${DB_PATH}`);

// Initialize database connection with WAL journal mode for better performance
let db: Database.Database;

try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  console.log('Successfully connected to database');
  
  // Set up tables if they don't exist
  db.exec(`
    -- Registered URLs table
    CREATE TABLE IF NOT EXISTS registered_urls (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Scan results table
    CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      success INTEGER NOT NULL,
      message TEXT NOT NULL,
      FOREIGN KEY (url_id) REFERENCES registered_urls(id)
    );

    -- Broken pages table
    CREATE TABLE IF NOT EXISTS broken_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      status INTEGER,
      error TEXT,
      FOREIGN KEY (result_id) REFERENCES scan_results(id)
    );
  `);
  
  console.log('Database tables initialized');
} catch (error) {
  console.error('Failed to initialize database:', error);
  throw error;
}

export default db; 