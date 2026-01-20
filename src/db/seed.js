import { openDb, closeDb } from './database.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function seedDatabase() {
  console.log('🌱 Starting seeding...');

  // Database connection is now synchronous (no await)
  const db = openDb();

  // Create users array (Bcrypt is still async, so we use await here)
  const users = [
    {
      email: 'admin@example.com',
      password: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User'
    },
    {
      email: 'user@example.com',
      password: await bcrypt.hash('password123', 10),
      firstName: 'Test',
      lastName: 'User'
    }
  ];

  // 1. Prepare the statement ONCE (faster performance)
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO users (email, password, firstName, lastName) 
    VALUES (?, ?, ?, ?)
  `);

  // 2. Run the statement multiple times inside the loop
  for (const user of users) {
    // .run() executes the prepared statement synchronously
    const info = insertStmt.run(user.email, user.password, user.firstName, user.lastName);
    
    // Check if a row was actually inserted (changes > 0)
    if (info.changes > 0) {
      console.log(`👤 Added user: ${user.email}`);
    } else {
      console.log(`⚠️  Skipped existing user: ${user.email}`);
    }
  }

  console.log('✅ Seeding completed!');
}

seedDatabase()
  .catch((err) => {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  })
  .finally(() => {
    // Closing is synchronous now
    closeDb();
  });