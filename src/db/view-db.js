import Database from 'better-sqlite3';
import path from 'path';

// 1. Connect to the database (Read-Only mode is safer for viewing)
const dbPath = path.join(process.cwd(), 'database.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

// 2. Get the specific table name from command line arguments (if any)
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
    console.log('\n💡  Usage: node view-db.js <table_name>');
  }

} else {
  // === MODE B: Show data for specific table ===
  try {
    console.log(`\n🔍  Viewing Table: ${tableName}`);
    
    const rows = db.prepare(`SELECT id, firstName, googleId, password, createdAt FROM ${tableName}`).all();
    
    if (rows.length === 0) {
      console.log('⚠️  Table is empty.');
    } else {
      // This prints the data in a beautiful grid
      console.table(rows); 
    }
  } catch (err) {
    console.error(`❌  Error: Table '${tableName}' does not exist.`);
  }
}

db.close();