import Database from 'better-sqlite3';
import path from 'path';

// 1. Connect to the database
// Note: Changed 'database.db' to 'finprime.db' to match your project
const dbPath = path.join(process.cwd(), 'database.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

// 2. Get the specific table name from command line arguments
const tableName = process.argv[2];

if (!tableName) {
  // === MODE A: List all tables ===
  console.log('\n📂  DATABASE TABLES FOUND:');
  console.log('--------------------------');
  
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name != 'sqlite_sequence'
  `).all();

  if (tables.length === 0) {
    console.log('⚠️  No tables found in the database.');
  } else {
    tables.forEach(t => {
      const count = db.prepare(`SELECT count(*) as total FROM ${t.name}`).get();
      console.log(`- ${t.name} (${count.total} rows)`);
    });
    console.log('\n💡  Usage: pnpx tsx src/utils/view-db.js <table_name>');
  }

} else {
  // === MODE B: Show data for specific table ===
  try {
    console.log(`\n🔍  Viewing Table: ${tableName}`);
    
    let query;

    // Smart Column Selection based on table name
    if (tableName === 'users') {
        // Exclude password for cleaner view
        query = `SELECT id, email, firstName, avatar, googleId, createdAt FROM ${tableName}`;
    } else if (tableName === 'transactions') {
        // query = `SELECT id, userId, transactionName, amount, type, category, createdAt FROM ${tableName}`;
        query = `SELECT * FROM ${tableName}`;
    } else {
        // Fallback for other tables (select everything)
        query = `SELECT * FROM ${tableName}`;
    }

    const rows = db.prepare(query).all();
    
    if (rows.length === 0) {
      console.log('⚠️  Table is empty.');
    } else {
      console.table(rows); 
    }
  } catch (err) {
    console.error(`❌  Error: Could not read table '${tableName}'.`);
    console.error(`   Details: ${err.message}`);
  }
}

db.close();