import { openDb, closeDb } from "./database.js";
import dotenv from "dotenv";

dotenv.config();

async function initDatabase() {
  console.log("🏗️  Initializing PostgreSQL database...");

  try {
    const db = openDb(); // This now returns the Postgres Pool

    // 1. Users Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        "googleId" TEXT,
        "firstName" TEXT,
        "lastName" TEXT,
        avatar TEXT, 
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. Transactions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "transactionName" TEXT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        type TEXT CHECK(type IN ('INCOME', 'EXPENSE')) NOT NULL,
        category TEXT NOT NULL,
        notes TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 3. Budgets Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        month TEXT NOT NULL, 
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE("userId", category, month)
      );
    `);

    // 4. Settings Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER UNIQUE NOT NULL,
        "themePreference" TEXT CHECK("themePreference" IN ('Light', 'Dark', 'System')) DEFAULT 'System',
        currency TEXT DEFAULT 'NGN',
        "aiInsights" BOOLEAN DEFAULT TRUE,
        "budgetAlerts" BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 5. Deleted Accounts Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS deleted_users (
        id SERIAL PRIMARY KEY,
        email TEXT,
        "originalUserId" INTEGER,
        "userCreatedAt" TIMESTAMP,
        "deletedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // 6. Verification Codes Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT CHECK(type IN ('REGISTRATION', 'PASSWORD_RESET')) NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // 7. AI Insights Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_insights (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        type TEXT CHECK(type IN ('DASHBOARD', 'BUDGET')) NOT NULL,
        content TEXT NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 8. User Sessions Table (Required for connect-pg-simple)
    await db.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);

    // Create an index for faster session lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);

    // 9. Onboarded Users Table (New Addition) 🆕
    await db.query(`
      CREATE TABLE IF NOT EXISTS onboarded_users (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER UNIQUE NOT NULL,
        "completedAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 10. Feedback Table 🗣️
    await db.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER, 
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY("userId") REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    console.log("✅ PostgreSQL database initialized successfully!");
  } catch (err) {
    console.error("❌ Error initializing database:", err);
    process.exit(1);
  } finally {
    closeDb();
  }
}

initDatabase();
