import { openDb, closeDb } from './database.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Helpers for Random Data
const incomeCategories = ['Salary', 'Business', 'Investments', 'Gifts', 'Others'];
const expenseCategories = ['Housing', 'Food', 'Transport', 'Shopping', 'Subscriptions', 'Others'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to get "YYYY-MM" for the CURRENT month
function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// NEW: Helper to get "YYYY-MM" for the PREVIOUS month
function getPreviousMonthKey() {
  const now = new Date();
  // Subtract 1 month
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prevDate.getFullYear();
  const month = String(prevDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Generates a date specifically in the current or previous month
function getStrategicDate(type) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  if (type === 'CURRENT_MONTH') {
    const day = Math.floor(Math.random() * now.getDate()) + 1;
    return new Date(year, month, day).toISOString();
  } else {
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

  const allUsers = db.prepare('SELECT id, email FROM users').all();

  // --- PART 2: SEED BUDGETS (UPDATED) ---
  console.log('📉 Seeding budgets...');
  
  const insertBudgetStmt = db.prepare(`
    INSERT OR REPLACE INTO budgets (userId, category, amount, month)
    VALUES (?, ?, ?, ?)
  `);

  const currentMonth = getCurrentMonthKey();   // e.g., "2026-01"
  const previousMonth = getPreviousMonthKey(); // e.g., "2025-12" or "2026-00" handled correctly by Date

  const monthsToSeed = [currentMonth, previousMonth];

  for (const user of allUsers) {
    for (const monthKey of monthsToSeed) {
        // Create a budget for EVERY expense category for this month
        for (const category of expenseCategories) {
            // Set a budget between 50k and 150k
            const amount = getRandomAmount(50000, 150000); 
            
            insertBudgetStmt.run(user.id, category, amount, monthKey);
        }
    }
  }
  console.log(`✅ Budgets seeded for ${currentMonth} and ${previousMonth}!`);

  // --- PART 3: SEED TRANSACTIONS ---
  console.log('💸 Seeding transactions...');

  const insertTxStmt = db.prepare(`
    INSERT INTO transactions (userId, transactionName, amount, type, category, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const user of allUsers) {
    console.log(`   -> Generating data for ${user.email}...`);
    
    // 1. Generate 40 Transactions for THIS Month
    for (let i = 0; i < 40; i++) {
      createRandomTransaction(user.id, 'CURRENT_MONTH');
    }

    // 2. Generate 40 Transactions for LAST Month
    for (let i = 0; i < 40; i++) {
      createRandomTransaction(user.id, 'PREVIOUS_MONTH');
    }
  }

  function createRandomTransaction(userId, period) {
    const isIncome = Math.random() > 0.5;
    const type = isIncome ? 'INCOME' : 'EXPENSE';
    const category = isIncome ? getRandomItem(incomeCategories) : getRandomItem(expenseCategories);
    
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