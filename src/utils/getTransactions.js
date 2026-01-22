import { openDb } from "../db/database.js";

export function getTransactions(userId, page = 1, recentOnly = false) {
    const db = openDb();
    const PAGE_SIZE = 15;

    // Validate Page Number (prevent negative offsets)
    const safePage = Math.max(1, parseInt(page) || 1);

    if (recentOnly) {
        // --- MODE A: Recent Transactions (Limit 7) ---
        // Simple query, just the latest 7 items
        const stmt = db.prepare(`
            SELECT id, transactionName, amount, type, category, notes, createdAt 
            FROM transactions 
            WHERE userId = ? 
            ORDER BY createdAt DESC 
            LIMIT 5
        `);
        
        return {
            data: stmt.all(userId),
            meta: { mode: 'recent' }
        };

    } else {
        // --- MODE B: Paginated History (Limit 15 per page) ---
        const offset = (safePage - 1) * PAGE_SIZE;

        // 1. Get the actual Data
        const dataStmt = db.prepare(`
            SELECT id, transactionName, amount, type, category, createdAt 
            FROM transactions 
            WHERE userId = ? 
            ORDER BY createdAt DESC 
            LIMIT ? OFFSET ?
        `);

        const transactions = dataStmt.all(userId, PAGE_SIZE, offset);

        // 2. Get Total Count (Crucial for Frontend Pagination UI)
        // We need this so the frontend knows if there is a "Page 2"
        const countStmt = db.prepare(`
            SELECT COUNT(*) as total 
            FROM transactions 
            WHERE userId = ?
        `);
        
        const totalResult = countStmt.get(userId);
        const totalTransactions = totalResult.total;
        const totalPages = Math.ceil(totalTransactions / PAGE_SIZE);

        return {
            data: transactions,
            meta: {
                page: safePage,
                limit: PAGE_SIZE,
                totalTransactions,
                totalPages,
                hasNextPage: safePage < totalPages,
                hasPrevPage: safePage > 1
            }
        };
    }
}