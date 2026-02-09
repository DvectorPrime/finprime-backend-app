import { openDb, closeDb } from './database.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const incomeCategories = ['Salary', 'Business', 'Investments', 'Gifts', 'Others'];
const expenseCategories = ['Housing', 'Food', 'Transport', 'Shopping', 'Subscriptions', 'Others'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getPreviousMonthKey() {
  const now = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prevDate.getFullYear();
  const month = String(prevDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getStrategicDate(type) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (type === 'CURRENT_MONTH') {
    const day = Math.floor(Math.random() * now.getDate()) + 1;
    return new Date(year, month, day).toISOString();
  } else {
    // Correctly handle previous month logic
    const daysInPrevMonth = new Date(year, month, 0).getDate(); 
    const day = Math.floor(Math.random() * daysInPrevMonth) + 1;
    return new Date(year, month - 1, day).toISOString();
  }
}

function getRandomAmount(min, max) {
  return (Math.random() * (max - min) + min).toFixed(2);
}

async function createRandomTransaction(db, userId, period) {
  const isIncome = Math.random() > 0.75;
  const type = isIncome ? 'INCOME' : 'EXPENSE';
  const category = isIncome ? getRandomItem(incomeCategories) : getRandomItem(expenseCategories);
  
  const amount = isIncome 
    ? getRandomAmount(50000, 200000) 
    : getRandomAmount(1000, 50000);

  const transactionName = `${category} - ${period === 'CURRENT_MONTH' ? 'Recent' : 'Old'}`;
  const notes = `Seeded data for ${period}`;
  const createdAt = getStrategicDate(period);

  await db.query(`
    INSERT INTO transactions ("userId", "transactionName", amount, type, category, notes, "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [userId, transactionName, amount, type, category, notes, createdAt]);
}

async function seedDatabase() {
  console.log('🌱 Starting PostgreSQL seeding...');

  const db = openDb();

  // --- PART 1: SEED USERS ---
  const users = [
    {
      email: 'admin@example.com',
      password: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User',
      avatar: '' 
    },
    {
      email: 'user@example.com',
      password: await bcrypt.hash('password123', 10),
      firstName: 'Test',
      lastName: 'User',
      avatar: ''
    }
  ];

  for (const user of users) {
    const res = await db.query(`
      INSERT INTO users (email, password, "firstName", "lastName", avatar) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, [user.email, user.password, user.firstName, user.lastName, user.avatar]);

    if (res.rowCount > 0) {
      console.log(`👤 Added user: ${user.email}`);
    } else {
      console.log(`⚠️  Skipped existing user: ${user.email}`);
    }
  }

  // Fetch all users to get their IDs
  const allUsersRes = await db.query('SELECT id, email FROM users');
  const allUsers = allUsersRes.rows;

  // --- PART 2: SEED BUDGETS ---
  console.log('📉 Seeding budgets...');
  
  const currentMonth = getCurrentMonthKey();
  const previousMonth = getPreviousMonthKey();
  const monthsToSeed = [currentMonth, previousMonth];

  for (const user of allUsers) {
    for (const monthKey of monthsToSeed) {
        for (const category of expenseCategories) {
            const amount = getRandomAmount(50000, 150000); 
            await db.query(`
              INSERT INTO budgets ("userId", category, amount, month)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT ("userId", category, month) 
              DO UPDATE SET amount = EXCLUDED.amount
            `, [user.id, category, amount, monthKey]);
        }
    }
  }
  console.log(`✅ Budgets seeded for ${currentMonth} and ${previousMonth}!`);

  // --- PART 3: SEED TRANSACTIONS ---
  console.log('💸 Seeding transactions...');

  for (const user of allUsers) {
    console.log(`   -> Generating data for ${user.email}...`);
    for (let i = 0; i < 35; i++) {
      await createRandomTransaction(db, user.id, 'CURRENT_MONTH');
    }
    for (let i = 0; i < 35; i++) {
      await createRandomTransaction(db, user.id, 'PREVIOUS_MONTH');
    }
  }

  // --- PART 4: SEED SETTINGS (NEW) ---
  console.log('⚙️  Seeding user settings...');
  
  for (const user of allUsers) {
    await db.query(`
      INSERT INTO settings ("userId", "themePreference", currency, "aiInsights", "budgetAlerts")
      VALUES ($1, 'System', 'NGN', TRUE, FALSE)
      ON CONFLICT ("userId") DO NOTHING
    `, [user.id]);
  }
  
  console.log('✅ Default settings applied to all users!');
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