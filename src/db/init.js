import { openDb, closeDb } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

function initDatabase() {
  console.log('🏗️  Initializing database...');

  try {
    // No 'await' needed anymore with better-sqlite3
    const db = openDb();

    // 1. Users Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        googleId TEXT,
        firstName TEXT,
        lastName TEXT,
        avatar TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Transactions Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        transactionName TEXT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        type TEXT CHECK(type IN ('INCOME', 'EXPENSE')) NOT NULL,
        category TEXT NOT NULL,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
      );
    `);

    // 3. Budgets Table (NEW)
    db.exec(`
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        month TEXT NOT NULL, 
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id),
        UNIQUE(userId, category, month)
      );
    `);

    console.log('✅ Database initialized successfully!');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    process.exit(1);
  } finally {
    // Close the connection synchronously
    closeDb();
  }
}

// Run the function directly
initDatabase();