import { openDb } from "../db/database.js";
import { getTransactions } from "../utils/getTransactions.js";

export async function getDashboardStats(req, res) {
    const userId = req.session?.userId; 

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = openDb();

    try {
        const now = new Date();
        
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const endOfPrevMonth = startOfCurrentMonth; 
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        // 1. Current Month Stats
        const currentStatsRes = await db.query(`
            SELECT 
                SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
            FROM transactions 
            WHERE "userId" = $1 AND "createdAt" >= $2
        `, [userId, startOfCurrentMonth]);
        
        const currentStats = {
            income: parseFloat(currentStatsRes.rows[0].income) || 0,
            expense: parseFloat(currentStatsRes.rows[0].expense) || 0
        };

        // 2. Previous Month Stats
        const prevMonthStatsRes = await db.query(`
            SELECT 
                SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as expense
            FROM transactions 
            WHERE "userId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3
        `, [userId, startOfPrevMonth, endOfPrevMonth]);

        const prevMonthStats = {
            income: parseFloat(prevMonthStatsRes.rows[0].income) || 0,
            expense: parseFloat(prevMonthStatsRes.rows[0].expense) || 0
        };

        // 3. Total Balance
        const balanceStatsRes = await db.query(`
            SELECT 
                (SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) - 
                 SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)) as total
            FROM transactions WHERE "userId" = $1
        `, [userId]);
        
        const balanceTotal = parseFloat(balanceStatsRes.rows[0].total) || 0;

        // 4. Previous Balance (Before Today)
        const prevBalanceStatsRes = await db.query(`
            SELECT 
                (SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) - 
                 SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)) as total
            FROM transactions WHERE "userId" = $1 AND "createdAt" < $2
        `, [userId, startOfToday]);

        const prevBalanceTotal = parseFloat(prevBalanceStatsRes.rows[0].total) || 0;

        const getPercentage = (curr, prev) => {
            if (!prev || prev === 0) {
                return curr > 0 ? 100 : 0; 
            }
            return ((curr - prev) / prev) * 100;
        };

        const responseData = {
            balance: {
                value: balanceTotal,
                percentage: getPercentage(balanceTotal, prevBalanceTotal)
            },
            income: {
                value: currentStats.income,
                percentage: getPercentage(currentStats.income, prevMonthStats.income)
            },
            expenses: {
                value: currentStats.expense,
                percentage: getPercentage(currentStats.expense, prevMonthStats.expense)
            },
            savingsRate: {
                value: currentStats.income 
                    ? ((currentStats.income - currentStats.expense) / currentStats.income) * 100 
                    : 0
            }
        };

        if (res) {
            return res.json(responseData);
        }
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        return res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
}

export async function getAllTransactions(req, res) {
    const userId = req.session.userId;
    const query = req.query;

    const filters = {
        page: query.page || 1,
        recentOnly: query.recentOnly === 'true',
        month: query.month,      
        year: query.year,        
        type: query.type,        
        category: query.category, 
        search: query.search      
    };

    try {
        const result = await getTransactions(userId, filters);
        res.json(result);
    } catch (err) {
        console.error("Get Transactions Error:", err);
        return res.status(500).json({ error: "An Error Occurred fetching transactions" });
    }
}

export async function createTransaction(req, res) {
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

        const result = await db.query(`
            INSERT INTO transactions ("userId", "transactionName", amount, type, category, notes, "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [userId, transactionName, finalAmount, finalType, category, notes || "", finalDate]);

        return res.status(201).json({ 
            message: "Transaction added successfully", 
            transactionId: result.rows[0].id 
        });

    } catch (err) {
        console.log("Create Transaction Error:", err);
        return res.status(500).json({ error: "Failed to save transaction." });
    }
}

export async function getMonthlyStats(req, res) {
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
                TO_CHAR("createdAt", 'YYYY-MM') as "monthKey",
                type,
                SUM(amount) as total
            FROM transactions
            WHERE "userId" = $1 AND "createdAt" >= $2
            GROUP BY "monthKey", type
            ORDER BY "monthKey" ASC
        `;

        const result = await db.query(query, [userId, startDateString]);
        const rows = result.rows;

        const dataMap = {};
        rows.forEach(row => {
            if (!dataMap[row.monthKey]) {
                dataMap[row.monthKey] = { income: 0, expense: 0 };
            }

            const val = parseFloat(row.total);
            
            if (row.type === 'INCOME') {
                dataMap[row.monthKey].income = val;
            } else {
                dataMap[row.monthKey].expense = val;
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
}