# 🔐 FinPrime (Backend)

This is the Backend API for FinPrime, built with Node.js, Express, and PostgreSQL (via Supabase). It handles authentication, transaction management, AI insights, and session-based security.

## 🌟 Key Features

- **Authentication:** Session-based auth with Express-Session and PostgreSQL store.
- **Database:** PostgreSQL integration with full CRUD for transactions and budgets.
- **Security:** Advanced CORS handling, `trust proxy` configuration, and Next.js Rewrite compatibility.
- **OAuth:** Google OAuth 2.0 integration.
- **Email Service:** Verification codes and transactional emails via Brevo.
- **AI Insights:** Financial analysis endpoints.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL (Hosted on Supabase)
- **Session Store:** `connect-pg-simple`
- **Authentication:** `bcryptjs` for password hashing
- **Package Manager:** pnpm

## 🚀 Getting Started

### 1. Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/installation) (Install via `npm install -g pnpm`)
- A PostgreSQL database (Local or [Supabase](https://supabase.com/))

### 2. Clone the Repository

```bash
git clone https://github.com/DvectorPrime/finprime-backend-app.git
cd finprime-backend-app
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Environment Variables

Create a `.env` file in the root directory. This is the most critical step. Use the following template:

```bash
PORT=8000
NODE_ENV=development

# Database (Supabase/Postgres Connection String)
DATABASE_URL="your_postgresql_connection_string"

# Auth Secrets
SECRETS="your_random_session_secret_here"

# Frontend URL (For CORS)
CLIENT_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"

# Email Service (Brevo/SendGrid)
BREVO_API_KEY="your_api_key"
EMAIL_FROM="your_verified_email"

# Cloudinary (Used for image hosting)
CLOUDINARY_CLOUD_NAME="your cloudinary name"
CLOUDINARY_API_KEY="your cloudinary key"
CLOUDINARY_API_SECRET="your cloudinary api key"

# GEMINI API key
GEMINI_API_KEY="your gemini key"
```

**⚠️ Security Note:** Ensure `.env` is added to your `.gitignore`. Never share your real connection strings or API keys.

### 5. Database Setup

The backend includes several database management scripts to help you set up and manage your database:

#### Initialize Database Tables

```bash
pnpm db:init
```

This creates all necessary tables in your PostgreSQL database.

#### Seed Sample Data

```bash
pnpm db:seed
```

Populates the database with sample data for testing.

#### View Database Contents

```bash
pnpm db:log
```

Display current database contents for debugging.

#### Drop Specific Tables

```bash
pnpm db:drop [table_name]
```

Example: `pnpm db:drop transactions`

#### Reset Database (Complete Reset)

```bash
pnpm db:reset
```

**⚠️ Warning:** This will drop all tables and recreate them with seed data. Use with caution!

This command drops the following tables in order:
- `transactions`
- `user_sessions`
- `onboarded_users`
- `budgets`
- `settings`
- `ai_insights`
- `users`
- `deleted_users`
- `verification_codes`

Then reinitializes all tables and seeds sample data.

### 6. Run the Development Server

```bash
# Development mode (with nodemon)
pnpm dev

# Production mode
pnpm start
```

The server will start on [http://localhost:8000](http://localhost:8000).

**Note:** The production start script automatically runs database initialization before starting the server.

## 🎯 Available Scripts

```bash
# Development
pnpm dev              # Start development server with auto-reload

# Production
pnpm start            # Initialize database and start production server

# Database Management
pnpm db:init          # Initialize all database tables
pnpm db:seed          # Seed database with sample data
pnpm db:drop          # Drop a specific table (requires table name)
pnpm db:log           # View current database contents
pnpm db:reset         # Complete database reset (drop all tables, reinit, and seed)
```

## 📁 Project Structure

```
finprime-backend-app/
├── src/
│   ├── controllers/      # Request handlers
│   ├── routes/           # API route definitions
│   ├── db/               # Database scripts
│   │   ├── init.js       # Initialize database tables
│   │   ├── seed.js       # Seed sample data
│   │   ├── dropTable.js  # Drop specific tables
│   │   └── view-db.js    # View database contents
│   ├── utils/            # Helper functions
│   └── server.js         # Main application entry point
├── .env                  # Environment variables (not committed)
├── .gitignore
├── package.json
└── README.md
```

## 🤝 Contributing

I'm open to contributions! To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/improvement-name`).
3. Commit your changes (`git commit -m 'Add some improvement'`).
4. Push to the branch (`git push origin feature/improvement-name`).
5. Open a Pull Request to the `main` branch.

**Please Note:** Ensure your code adheres to the existing ES Module structure (using `import/export` rather than `require`).

### Code Style Guidelines

- Use ES6+ syntax
- Follow existing code formatting
- Add comments for complex logic
- Write descriptive commit messages
- Test your changes before submitting a PR

## 🛡️ Security Features

- **Safari ITP Fix:** Includes `trust proxy` and `sameSite: 'none'` / `secure: true` cookie configurations.
- **CORS:** Configured to allow Vercel preview deployments dynamically.
- **Session Security:** Secure session management with PostgreSQL-backed storage.
- **Password Hashing:** Using `bcryptjs` for secure password storage.
- **Environment Variables:** Sensitive data isolated in `.env` file.

## 🐛 Known Issues

- **Session Issues on Safari/iOS:** If experiencing session persistence issues on localhost, ensure cookies are set with proper `sameSite` and `secure` is `none` flags in development.

## 📄 License

This project is distributed under a **custom license** for educational and contribution purposes only. Commercial and personal use is **strictly prohibited**.

See `LICENSE` for more information.

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/) - Fast, unopinionated web framework
- [Supabase](https://supabase.com/) - PostgreSQL database hosting
- [Brevo](https://www.brevo.com/) - Email service provider
- [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple) - PostgreSQL session store
- [Cloudinary](https://cloudinary.com) - Image Hosting Platform

---

Built with ❤️ by Victor