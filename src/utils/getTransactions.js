import { openDb } from "../db/database.js";

export function getTransactions(userId, filters) {
    const db = openDb();
    const PAGE_SIZE = 15;
    const safePage = Math.max(1, parseInt(filters.page) || 1);

    // --- CASE 1: Dashboard "Recent Only" Mode (Fast Path) ---
    if (filters.recentOnly) {
        const stmt = db.prepare(`
            SELECT id, transactionName, amount, type, category, notes, createdAt, notes 
            FROM transactions 
            WHERE userId = ? 
            ORDER BY createdAt DESC 
            LIMIT 5
        `);
        return {
            data: stmt.all(userId),
            meta: { mode: 'recent' }
        };
    }

    // --- CASE 2: Full Transactions Page ---
    
    // 1. Build the Dynamic Query
    // We will use the same 'whereClause' for 3 things: 
    // (a) Getting the data, (b) Counting pages, (c) Summing totals
    
    const conditions = ["userId = ?"];
    const params = [userId];

    // A. Type Filter
    if (filters.type && filters.type !== 'all' && filters.type !== 'All Types') {
        conditions.push("type = ?");
        params.push(filters.type.toUpperCase());
    }

    // B. Category Filter
    if (filters.category && filters.category !== 'all' && filters.category !== 'All Categories') {
        conditions.push("category = ?");
        params.push(filters.category);
    }

    // C. Search Filter
    if (filters.search) {
        conditions.push("(transactionName LIKE ? OR notes LIKE ?)");
        const searchTerm = `%${filters.search}%`; 
        params.push(searchTerm, searchTerm);
    }

    // D. Date Filter (Month & Year)
    if (filters.month && filters.year) {
        const year = parseInt(filters.year);
        const month = parseInt(filters.month); // 0 = Jan, 11 = Dec

        const startDate = new Date(year, month, 1).toISOString();
        const nextMonthStart = new Date(year, month + 1, 1).toISOString();

        conditions.push("createdAt >= ? AND createdAt < ?");
        params.push(startDate, nextMonthStart);
    }

    // Combine conditions
    const whereClause = " WHERE " + conditions.join(" AND ");


    // --- 2. EXECUTE QUERIES ---

    // Query A: Get Pagination Count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM transactions ${whereClause}`);
    const totalResult = countStmt.get(...params);
    const totalTransactions = totalResult.total;
    const totalPages = Math.ceil(totalTransactions / PAGE_SIZE);

    // Query B: Get Financial Totals (The new part!)
    // We sum up the results based on the EXACT same filters. 
    // If you filtered for "Food", Income will be 0 and Expense will be the sum of Food.
    const summaryStmt = db.prepare(`
        SELECT 
            SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as totalIncome,
            SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as totalExpense
        FROM transactions 
        ${whereClause}
    `);
    
    const summaryResult = summaryStmt.get(...params);

    const offset = (safePage - 1) * PAGE_SIZE;
    const finalParams = [...params, PAGE_SIZE, offset]; // Add Limit/Offset to end of params

    const dataStmt = db.prepare(`
        SELECT id, transactionName, amount, type, category, createdAt, notes 
        FROM transactions 
        ${whereClause} 
        ORDER BY createdAt DESC 
        LIMIT ? OFFSET ?
    `);

    const transactions = dataStmt.all(...finalParams);

    return {
        data: transactions,
        summary: {
            totalIncome: summaryResult.totalIncome || 0,
            totalExpense: summaryResult.totalExpense || 0,
            net: (summaryResult.totalIncome || 0) - (summaryResult.totalExpense || 0)
        },
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