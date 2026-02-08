import express from 'express';
import dotenv from 'dotenv';
import connectPgSimple from 'connect-pg-simple';
import { openDb } from './db/database.js';
import cors from 'cors';
import session from "express-session";

import { authRouter } from './routes/authRouter.js';
import { transactionsRouter } from './routes/transactionsRouter.js';
import { budgetRouter } from './routes/budgetRouter.js';
import { settingsRouter } from './routes/settingsRouter.js';
import { uploadRouter } from './routes/uploadRouter.js';
import { aiRouter } from './routes/aiRouter.js';
import { feedbackRouter } from './routes/feedbackRouter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const PgSession = connectPgSimple(session);
const db = openDb();

// 1. TRUST PROXY (Critical for Render & Safari Cookies)
app.set('trust proxy', 1);

// 2. ROBUST CORS SETUP
const allowedOrigins = [
  "http://localhost:3000",
  process.env.CLIENT_URL,          // Your main Vercel URL from Render Env
  "https://finprime.vercel.app"    // Fallback
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is in our allowed list OR if it is a Vercel Preview URL
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith(".vercel.app")) {
      callback(null, true);
    } else {
      console.log("🚫 Blocked by CORS:", origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. SESSION WITH SAFARI FIX
app.use(session({
  store: new PgSession({
    pool: db,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SECRETS,
  resave: false,
  saveUninitialized: false,
  
  // ⚠️ CRITICAL PROXY SETTING
  proxy: true, 

  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 Days
    httpOnly: true,
    
    // Secure & SameSite logic
    // If in Production (Render), use 'true' and 'none'.
    // If in Dev (Localhost), use 'false' and 'lax'.
    secure: process.env.NODE_ENV === 'production', 
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' 
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRouter);
app.use('/transactions', transactionsRouter);
app.use('/budgets', budgetRouter);
app.use('/settings', settingsRouter);
app.use('/upload', uploadRouter);
app.use('/ai-insight', aiRouter);
app.use('/feedback', feedbackRouter);

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Heartbeat
app.get('/health-db', async (req, res) => {
  try {
    const db = openDb();
    await db.query('SELECT 1'); 
    console.log('💓 Heartbeat: Database is active.');
    res.status(200).send('System Alive & Database Connected 🟢');
  } catch (error) {
    console.error('❌ Heartbeat Failed:', error);
    res.status(500).send('Database Error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
});