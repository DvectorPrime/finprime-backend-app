import Database from 'better-sqlite3';
import path from 'path';

let db = null;

export function openDb() {
  // If database is already open, return the existing instance
  if (db) return db;

  // Resolve the full path to the database file
  const dbPath = path.join(process.cwd(), process.env.DATABASE_PATH || 'database.db');

  // Open the database
  db = new Database(dbPath, { 
    // verbose: console.log // Uncomment this line to see every query printed to the console
  });

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}