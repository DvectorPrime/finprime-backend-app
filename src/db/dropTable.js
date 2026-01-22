import { openDb, closeDb } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

function dropTable() {
  // 1. Get table name from the command line (e.g., "node dropTable.js users")
  const tableName = process.argv[2];

  if (!tableName) {
    console.error('⚠️  Please provide a table name.');
    console.error('   Usage: node src/utils/dropTable.js <tableName>');
    process.exit(1);
  }

  console.log(`🔥 Dropping table: "${tableName}"...`);

  try {
    const db = openDb();

    // 2. Security Check: Ensure tableName is just letters/numbers (prevent SQL injection)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      throw new Error("Invalid table name. Use only letters, numbers, and underscores.");
    }

    // 3. Execute the DROP command
    db.exec(`DROP TABLE IF EXISTS ${tableName};`);

    console.log(`✅ Table "${tableName}" dropped successfully (if it existed).`);

  } catch (err) {
    console.error(`❌ Error dropping table "${tableName}":`, err.message);
    process.exit(1);
  } finally {
    closeDb();
  }
}

dropTable();