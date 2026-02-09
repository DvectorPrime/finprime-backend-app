import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();


const { Pool } = pkg;


let pool = null;

export function openDb() {
  if (pool) return pool;

  // 1. Determine if we are in Production (Render) or Development (Local)
  const isProduction = process.env.NODE_ENV === 'production';

  // 2. Get the Connection String
  const connectionString = process.env.DATABASE_URL; 

  // 3. Create the Pool
  pool = new Pool({
    connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  });

  return pool;
}

export function closeDb() {
  if (pool) {
    pool.end(); 
    pool = null;
  }
}