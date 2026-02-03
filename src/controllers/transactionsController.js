import { openDb } from "../db/database.js";

import {getTransactions} from "../utils/getTransactions.js"

export  function getDashboardStats(req, res) {
    const userId = req.session?.userId; 

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = openDb();

    const now = new Date();
    
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    
    const endOfPrevMonth = startOfCurrentMonth; 
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const currentStats = db.prepare(`
        SELECT 
            SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
        FROM transactions 
        WHERE userId = ? AND createdAt >= ?
    `).get(userId, startOfCurrentMonth);

    const prevMonthStats = db.prepare(`
        SELECT 
            SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
        FROM transactions 
        WHERE userId = ? AND createdAt >= ? AND createdAt < ?
    `).get(userId, startOfPrevMonth, endOfPrevMonth);

    const balanceStats = db.prepare(`
        SELECT 
            (SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) - 
             SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)) as total
        FROM transactions WHERE userId = ?
    `).get(userId);

    const prevBalanceStats = db.prepare(`
        SELECT 
            (SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) - 
             SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)) as total
        FROM transactions WHERE userId = ? AND createdAt < ?
    `).get(userId, startOfToday);

    const getPercentage = (curr, prev) => {
        if (!prev || prev === 0) {
            return curr > 0 ? 100 : 0; 
        }
        return ((curr - prev) / prev) * 100;
    };

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
        const today = new Date();
        const startMetricsDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
        const startDateString = startMetricsDate.toISOString();

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

        const finalChartData = [];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const key = `${year}-${month}`;

            const stats = dataMap[key] || { income: 0, expense: 0 };

            finalChartData.push({
                month: monthNames[d.getMonth()], 
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