import { openDb } from "../db/database.js";

import {getTransactions} from "../utils/getTransactions.js"

export  function getDashboardStats(req, res) {
    // IMPORTANT: Make sure you actually get the ID here!
    const userId = req.session?.userId; 

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = openDb();

    // --- DATE LOGIC ---
    const now = new Date();
    
    // 1. Current Month Start (e.g., Feb 1st)
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // 2. Previous Month Start (e.g., Jan 1st)
    // We subtract 1 from the month index. JS handles year rollover automatically (Jan - 1 = Dec of prev year)
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    
    // 3. Previous Month End (The split second before Feb 1st)
    // This is effectively the cutoff for "Last Month"
    const endOfPrevMonth = startOfCurrentMonth; 
    
    // 4. Start of Today (For Balance daily change, we keep this as is)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();


    // --- QUERIES ---

    // A. Get Stats for THIS Month
    const currentStats = db.prepare(`
        SELECT 
            SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
        FROM transactions 
        WHERE userId = ? AND createdAt >= ?
    `).get(userId, startOfCurrentMonth);

    // B. Get Stats for LAST Month (Full Month)
    const prevMonthStats = db.prepare(`
        SELECT 
            SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
        FROM transactions 
        WHERE userId = ? AND createdAt >= ? AND createdAt < ?
    `).get(userId, startOfPrevMonth, endOfPrevMonth);


    // C. Total Balance (All Time) - Remains the same
    const balanceStats = db.prepare(`
        SELECT 
            (SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) - 
             SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)) as total
        FROM transactions WHERE userId = ?
    `).get(userId);

    // D. Balance Yesterday (For Daily comparison)
    // *Strategy Note:* For "Balance", users usually prefer seeing the DAILY change 
    // ("Did I get richer today?") rather than monthly. So I kept this as "vs Yesterday".
    const prevBalanceStats = db.prepare(`
        SELECT 
            (SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) - 
             SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)) as total
        FROM transactions WHERE userId = ? AND createdAt < ?
    `).get(userId, startOfToday);


    // --- HELPER ---
    const getPercentage = (curr, prev) => {
        if (!prev || prev === 0) {
            // If previous month was 0, and current is > 0, technically it's 100% growth (or infinity)
            return curr > 0 ? 100 : 0; 
        }
        return ((curr - prev) / prev) * 100;
    };

    // --- RESPONSE ---
    const responseData = {
        balance: {
            value: balanceStats.total || 0,
            percentage: getPercentage(balanceStats.total, prevBalanceStats.total) // Keeps daily compare
        },
        income: {
            value: currentStats.income || 0,
            percentage: getPercentage(currentStats.income, prevMonthStats.income) // NOW compares vs Last Month
        },
        expenses: {
            value: currentStats.expense || 0,
            percentage: getPercentage(currentStats.expense, prevMonthStats.expense) // NOW compares vs Last Month
        },
        savingsRate: {
            // (Income - Expense) / Income
            value: currentStats.income 
                ? ((currentStats.income - currentStats.expense) / currentStats.income) * 100 
                : 0
        }
    };

    if (res) {
        return res.json(responseData);
    } 
}

export async function getAllTransactions(req, res) {
    const userId = req.session.userId;
    const query = req.query;

    // Extract all potential filters
    const filters = {
        page: query.page || 1,
        recentOnly: query.recentOnly === 'true',
        
        // New Filters
        month: query.month,       // e.g., "0" for Jan, "11" for Dec
        year: query.year,         // e.g., "2026"
        type: query.type,         // "INCOME", "EXPENSE", or "all"
        category: query.category, // e.g., "Food", "Salary" or "all"
        search: query.search      // e.g., "Netflix"
    };

    try {
        const result = getTransactions(userId, filters);
        res.json(result);
    } catch (err) {
        console.error("Get Transactions Error:", err);
        return res.status(500).json({ error: "An Error Occured fetching transactions" });
    }
}

export function createTransaction(req, res) {
    const userId = req.session?.userId; 

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    const { transactionName, amount, type, category, date, notes } = req.body;

    if (!transactionName || !amount || !type || !category) {
        return res.status(400).json({ error: "Please fill in all required fields." });
    }

    if (category === "All Categories" || category === "all") {
        return res.status(400).json({ error: "Please select a valid category." });
    }

    const db = openDb();

    try {
        const finalDate = new Date(date).toISOString();
        const finalType = type.toUpperCase(); 
        const finalAmount = parseFloat(amount);

        const stmt = db.prepare(`
            INSERT INTO transactions (userId, transactionName, amount, type, category, notes, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const info = stmt.run(
            userId,
            transactionName,
            finalAmount,
            finalType,
            category,
            notes || "", 
            finalDate
        );

        return res.status(201).json({ 
            message: "Transaction added successfully", 
            transactionId: info.lastInsertRowid 
        });

    } catch (err) {
        console.log("Create Transaction Error:", err);
        return res.status(500).json({ error: "Failed to save transaction." });
    }
}

export const getMonthlyStats = (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = openDb();

    try {
        // 1. Calculate the start date (1st day of the month, 5 months ago)
        // This gives us a 6-month window including the current month
        const today = new Date();
        const startMetricsDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
        const startDateString = startMetricsDate.toISOString();

        // 2. SQL Query: Group by Month (YYYY-MM) and Type
        // We use strftime to extract the 'YYYY-MM' part of the date for grouping
        const query = `
            SELECT 
                strftime('%Y-%m', createdAt) as monthKey,
                type,
                SUM(amount) as total
            FROM transactions
            WHERE userId = ? AND createdAt >= ?
            GROUP BY monthKey, type
            ORDER BY monthKey ASC
        `;

        const rows = db.prepare(query).all(userId, startDateString);

        // 3. Process Data into a Map for easy lookup
        // Result: { '2025-08': { income: 500, expense: 200 }, '2025-09': ... }
        const dataMap = {};
        rows.forEach(row => {
            if (!dataMap[row.monthKey]) {
                dataMap[row.monthKey] = { income: 0, expense: 0 };
            }
            if (row.type === 'INCOME') {
                dataMap[row.monthKey].income = row.total;
            } else {
                dataMap[row.monthKey].expense = row.total;
            }
        });

        // 4. Generate the final array for the last 6 months (filling in gaps)
        const finalChartData = [];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        for (let i = 5; i >= 0; i--) {
            // Calculate date for iteration "i" months ago
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            
            // Generate Key: "2025-08"
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const key = `${year}-${month}`;

            // Get data or default to 0
            const stats = dataMap[key] || { income: 0, expense: 0 };

            finalChartData.push({
                month: monthNames[d.getMonth()], // e.g., "Aug"
                income: stats.income,
                expense: stats.expense
            });
        }

        res.json(finalChartData);

    } catch (error) {
        console.error("Monthly Stats Error:", error);
        res.status(500).json({ error: "Failed to fetch chart data" });
    }
};