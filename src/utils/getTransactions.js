import { openDb } from "../db/database.js";

export async function getTransactions(userId, filters) {
    const db = openDb();
    const PAGE_SIZE = 15;
    const safePage = Math.max(1, parseInt(filters.page) || 1);

    // --- SCENARIO 1: RECENT ONLY (Dashboard) ---
    if (filters.recentOnly) {
        // Change ? to $1
        const res = await db.query(`
            SELECT id, "transactionName", amount, type, category, notes, "createdAt" 
            FROM transactions 
            WHERE "userId" = $1 
            ORDER BY "createdAt" DESC 
            LIMIT 5
        `, [userId]);

        return {
            data: res.rows,
            meta: { mode: 'recent' }
        };
    }

    // --- SCENARIO 2: FILTERED LIST ---
    
    // Start with the base condition (User ID is always $1)
    const conditions = [`"userId" = $1`];
    const params = [userId];

    // Helper to get the next placeholder number (e.g., $2, $3...)
    const nextParam = () => `$${params.length + 1}`;

    // A. Type Filter
    if (filters.type && filters.type !== 'all' && filters.type !== 'All Types') {
        conditions.push(`type = ${nextParam()}`);
        params.push(filters.type.toUpperCase());
    }

    // B. Category Filter
    if (filters.category && filters.category !== 'all' && filters.category !== 'All Categories') {
        conditions.push(`category = ${nextParam()}`);
        params.push(filters.category);
    }

    // C. Search Filter
    if (filters.search) {
        // We need two placeholders for the same search term
        const p1 = nextParam(); // e.g. $3
        // We push the term first so params.length increases for the next call
        params.push(`%${filters.search}%`); 
        
        const p2 = nextParam(); // e.g. $4
        params.push(`%${filters.search}%`);

        conditions.push(`("transactionName" ILIKE ${p1} OR notes ILIKE ${p2})`);
        // Note: ILIKE is Postgres specific. It means "Case Insensitive Like" (matches "food" and "Food")
    }

    // D. Date Filter (Month & Year)
    if (filters.month && filters.year) {
        const year = parseInt(filters.year);
        const month = parseInt(filters.month); // 0 = Jan

        const startDate = new Date(year, month, 1).toISOString();
        const nextMonthStart = new Date(year, month + 1, 1).toISOString();

        const pStart = nextParam();
        params.push(startDate);
        
        const pEnd = nextParam();
        params.push(nextMonthStart);

        conditions.push(`"createdAt" >= ${pStart} AND "createdAt" < ${pEnd}`);
    }

    // Combine conditions
    const whereClause = " WHERE " + conditions.join(" AND ");

    // 1. GET TOTAL COUNT
    const countQuery = `SELECT COUNT(*) as total FROM transactions ${whereClause}`;
    const countRes = await db.query(countQuery, params);
    const totalTransactions = parseInt(countRes.rows[0].total); // Postgres returns count as string
    const totalPages = Math.ceil(totalTransactions / PAGE_SIZE);

    // 2. GET SUMMARY (Income vs Expense)
    const summaryQuery = `
        SELECT 
            SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as "totalIncome",
            SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as "totalExpense"
        FROM transactions 
        ${whereClause}
    `;
    const summaryRes = await db.query(summaryQuery, params);
    const summaryRow = summaryRes.rows[0];

    // Parse Postgres results (SUM returns string or null)
    const totalIncome = parseFloat(summaryRow.totalIncome) || 0;
    const totalExpense = parseFloat(summaryRow.totalExpense) || 0;

    // 3. GET DATA (With Pagination)
    const offset = (safePage - 1) * PAGE_SIZE;
    
    // Add LIMIT and OFFSET to params
    const limitParam = nextParam();
    params.push(PAGE_SIZE);
    
    const offsetParam = nextParam();
    params.push(offset);

    const dataQuery = `
        SELECT id, "transactionName", amount, type, category, "createdAt", notes 
        FROM transactions 
        ${whereClause} 
        ORDER BY "createdAt" DESC 
        LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const dataRes = await db.query(dataQuery, params);

    return {
        data: dataRes.rows,
        summary: {
            totalIncome,
            totalExpense,
            net: totalIncome - totalExpense
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