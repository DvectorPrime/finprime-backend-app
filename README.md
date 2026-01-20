# Express + SQLite3 Project (ES Modules with pnpm)

## Getting Started

### 1. Install dependencies
```bash
pnpm install
```

### 2. Initialize the database
```bash
pnpm db:init
```

### 3. Seed the database
```bash
pnpm db:seed
```

### 4. Run development server
```bash
pnpm dev
```

The server will start on http://localhost:3000

## Scripts

- `pnpm dev` - Start development server with auto-reload
- `pnpm start` - Start production server
- `pnpm db:init` - Initialize database tables
- `pnpm db:seed` - Seed database with sample data
- `pnpm db:reset` - Initialize and seed database in one command

## API Endpoints

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID

## Project Structure
```
.
├── src/
│   ├── db/
│   │   ├── database.js      # Database connection
│   │   ├── helpers.js       # Database helper functions
│   │   ├── init.js          # Database initialization
│   │   └── seed.js          # Database seeding
│   ├── controllers/
│   │   └── userController.js
│   ├── routes/
│   │   └── userRoutes.js
│   ├── middleware/
│   ├── utils/
│   └── server.js            # Main server file
├── .env
├── .gitignore
├── nodemon.json
├── package.json
└── README.md
```

## Environment Variables

Edit the `.env` file in the root directory:
```
PORT=3000
NODE_ENV=development
DATABASE_PATH=./database.db
```

## Default Users

After seeding, you'll have:
- Email: admin@example.com (Password: password123)
- Email: user@example.com (Password: password123)

## Database Queries

Use the helper functions in `src/db/helpers.js`:
```javascript
import { getAll, getOne, runQuery } from './db/helpers.js';

// Get all records
const users = await getAll('SELECT * FROM users');

// Get one record
const user = await getOne('SELECT * FROM users WHERE id = ?', [1]);

// Run insert/update/delete
await runQuery('INSERT INTO users (email, password) VALUES (?, ?)', ['test@test.com', 'hashed']);
```
