import express from 'express';
import dotenv from 'dotenv';
import connectPgSimple from 'connect-pg-simple';
import { openDb } from './db/database.js';
import cors from 'cors';
import session from "express-session"

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

const PgSession = connectPgSimple(session)
const db = openDb()

const allowedOrigins = [
  process.env.CLIENT_URL,                    // Production Frontend (set in Render)
  "https://finprime.vercel.app"              // Fallback (Optional, but good safety net)
].filter(Boolean);

app.set('trust proxy', 1);

// Middleware

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("Blocked by CORS:", origin); // Helpful for debugging
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Crucial for cookies/sessions
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(session({
  // CONNECT POSTGRES HERE ⬇️
  store: new PgSession({
    pool: db, // Use your existing connection pool
    tableName: 'user_sessions', // We will create this table automatically
    createTableIfMissing: true // Handy! Creates the table for you
  }),
  secret: process.env.SECRETS,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none': 'lax',
    maxAge: 1000 * 60 * 60 * 24 // 1 Day
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRouter)
app.use('/transactions', transactionsRouter)
app.use('/budgets', budgetRouter)
app.use('/settings', settingsRouter)
app.use('/upload', uploadRouter)
app.use('/ai-insight', aiRouter)
app.use('/feedback', feedbackRouter)

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

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
