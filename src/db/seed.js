import { openDb, closeDb } from './database.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Helpers for Random Data
const incomeCategories = ['Salary', 'Business', 'Investments', 'Gifts', 'Others'];
const expenseCategories = ['Housing', 'Food', 'Transport', 'Shopping', 'Subscriptions'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// NEW: Generates a date specifically in the current or previous month
function getStrategicDate(type) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  if (type === 'CURRENT_MONTH') {
    // Random day in CURRENT month (e.g., 1st to Today)
    const day = Math.floor(Math.random() * now.getDate()) + 1;
    return new Date(year, month, day).toISOString();
  } else {
    // Random day in PREVIOUS month (e.g., 1st to 28th/30th/31st)
    // "month - 1" handles January rollover automatically
    const daysInPrevMonth = new Date(year, month, 0).getDate(); 
    const day = Math.floor(Math.random() * daysInPrevMonth) + 1;
    return new Date(year, month - 1, day).toISOString();
  }
}

function getRandomAmount(min, max) {
  return (Math.random() * (max - min) + min).toFixed(2);
}

async function seedDatabase() {
  console.log('🌱 Starting seeding...');

  const db = openDb();

  // --- PART 1: SEED USERS ---
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

  const insertUserStmt = db.prepare(`
    INSERT OR IGNORE INTO users (email, password, firstName, lastName) 
    VALUES (?, ?, ?, ?)
  `);

  for (const user of users) {
    const info = insertUserStmt.run(user.email, user.password, user.firstName, user.lastName);
    if (info.changes > 0) {
      console.log(`👤 Added user: ${user.email}`);
    } else {
      console.log(`⚠️  Skipped existing user: ${user.email}`);
    }
  }

  // --- PART 2: SEED TRANSACTIONS ---
  const allUsers = db.prepare('SELECT id, email FROM users').all();
  
  const insertTxStmt = db.prepare(`
    INSERT INTO transactions (userId, transactionName, amount, type, category, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  console.log('💸 Seeding strategic transactions...');

  for (const user of allUsers) {
    console.log(`   -> Generating data for ${user.email} (ID: ${user.id})...`);
    
    // 1. Generate 5 Transactions for THIS Month
    for (let i = 0; i < 40; i++) {
      createRandomTransaction(user.id, 'CURRENT_MONTH');
    }

    // 2. Generate 5 Transactions for LAST Month
    // (This ensures your dashboard has a "Previous Period" to compare against)
    for (let i = 0; i < 40; i++) {
      createRandomTransaction(user.id, 'PREVIOUS_MONTH');
    }
  }

  function createRandomTransaction(userId, period) {
    const isIncome = Math.random() > 0.5;
    const type = isIncome ? 'INCOME' : 'EXPENSE';
    const category = isIncome ? getRandomItem(incomeCategories) : getRandomItem(expenseCategories);
    
    // Salary is usually higher
    const amount = isIncome 
      ? getRandomAmount(50000, 200000) 
      : getRandomAmount(1000, 50000);

    const transactionName = `${category} - ${period === 'CURRENT_MONTH' ? 'Recent' : 'Old'}`;
    const notes = `Seeded data for ${period}`;
    const createdAt = getStrategicDate(period);

    insertTxStmt.run(
      userId,
      transactionName,
      amount,
      type,
      category,
      notes,
      createdAt
    );
  }

  console.log('✅ Seeding completed successfully!');
}

seedDatabase()
  .catch((err) => {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  })
  .finally(() => {
    closeDb();
  });