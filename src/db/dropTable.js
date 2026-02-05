import { openDb, closeDb } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

async function dropTable() {
  // 1. Get table name from the command line
  const tableName = process.argv[2];

  if (!tableName) {
    console.error('⚠️  Please provide a table name.');
    console.error('   Usage: node db/dropTable.js <tableName>');
    process.exit(1);
  }

  console.log(`🔥 Dropping table: "${tableName}"...`);

  try {
    const db = openDb();

    // 2. Security Check: Ensure tableName is just letters/numbers
    // (This prevents SQL injection since we can't use parameters for table names)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      throw new Error("Invalid table name. Use only letters, numbers, and underscores.");
    }

    // 3. Execute the DROP command
    // Added 'CASCADE' to remove dependencies (like Foreign Keys from other tables)
    await db.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);

    console.log(`✅ Table "${tableName}" dropped successfully (if it existed).`);

  } catch (err) {
    console.error(`❌ Error dropping table "${tableName}":`, err.message);
    process.exit(1);
  } finally {
    // 4. Clean up connection
    closeDb();
  }
}

dropTable();