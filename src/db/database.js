import pkg from 'pg';
import dotenv from 'dotenv';

// Load .env variables locally
dotenv.config();

// Destructure Pool from the pg package
const { Pool } = pkg;

// Singleton to hold the pool instance
let pool = null;

export function openDb() {
  // If the pool already exists, return it (Singleton pattern)
  if (pool) return pool;

  // 1. Determine if we are in Production (Render) or Development (Local)
  const isProduction = process.env.NODE_ENV === 'production';

  // 2. Get the Connection String
  // On Render, 'DATABASE_URL' is provided automatically.
  // Locally, we fallback to your local machine's string.
  const connectionString = process.env.DATABASE_URL; 

  // 3. Create the Pool
  pool = new Pool({
    connectionString,
    // Render requires SSL for Postgres. Local usually does not.
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  });

  // Note: We don't need "db.pragma('foreign_keys = ON')" anymore.
  // PostgreSQL enforces foreign keys by default!

  return pool;
}

export function closeDb() {
  if (pool) {
    pool.end(); // Closes all connections in the pool
    pool = null;
  }
}