import { openDb, closeDb } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

async function viewDb() {
  const tableName = process.argv[2];
  const db = openDb();

  try {
    if (!tableName) {
      // === MODE A: List all tables ===
      console.log('\n📂  DATABASE TABLES FOUND:');
      console.log('--------------------------');

      // 1. Get list of tables from Postgres System Catalog
      const res = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);

      const tables = res.rows;

      if (tables.length === 0) {
        console.log('⚠️  No tables found in the database.');
      } else {
        // 2. Loop through and get count for each
        for (const t of tables) {
          const countRes = await db.query(`SELECT COUNT(*) FROM ${t.table_name}`);
          const count = countRes.rows[0].count;
          console.log(`- ${t.table_name} (${count} rows)`);
        }
        console.log('\n💡  Usage: node db/viewdb.js <table_name>');
      }

    } else {
      // === MODE B: Show data for specific table ===
      
      // Security Check (Prevent SQL Injection via table name)
      if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        throw new Error("Invalid table name. Use only letters, numbers, and underscores.");
      }

      console.log(`\n🔍  Viewing Table: ${tableName}`);
      
      let query;

      if (tableName === 'users') {
        query = `SELECT id, email, "firstName", "lastName", avatar, "googleId", "createdAt" FROM ${tableName}`;
      } else {
        // Fallback for other tables (select everything)
        query = `SELECT * FROM ${tableName}`;
      }

      const res = await db.query(query);
      const rows = res.rows;
      
      if (rows.length === 0) {
        console.log('⚠️  Table is empty.');
      } else {
        console.table(rows); 
      }
    }
  } catch (err) {
    console.error(`❌  Error: Could not read table '${tableName || 'database'}'.`);
    console.error(`   Details: ${err.message}`);
  } finally {
    closeDb();
  }
}

viewDb();