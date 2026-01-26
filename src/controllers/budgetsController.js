import { openDb } from "../db/database.js";
import { getMonthDateRange } from "../utils/getMonthRange.js"

export const getBudgetOverview = (req, res) => {
    // 1. Get User ID from Session
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    try {
        const db = openDb();

        // =========================================================
        // PART A: CURRENT MONTH OVERVIEW (Cards & Categories)
        // =========================================================
        const current = getMonthDateRange(0); // Offset 0 = This Month

        // Query 1: Get user's PLANNED budgets for this month
        const budgets = db.prepare(`
            SELECT category, amount 
            FROM budgets 
            WHERE userId = ? AND month = ?
        `).all(userId, current.monthKey);

        // Query 2: Get user's ACTUAL spending grouped by Category for this month
        const expenses = db.prepare(`
            SELECT category, SUM(amount) as total
            FROM transactions 
            WHERE userId = ? 
            AND type = 'EXPENSE'
            AND createdAt >= ? 
            AND createdAt <= ?
            GROUP BY category
        `).all(userId, current.start, current.end);

        // --- Processing Logic ---
        
        // Map expenses for quick lookup: { "Food": 5000, "Transport": 200 }
        const expenseMap = new Map(expenses.map(e => [e.category, e.total]));

        let totalBudget = 0;
        
        // Merge Budget Plans with Actual Reality
        const categoryData = budgets.map((b) => {
            const spent = expenseMap.get(b.category) || 0;
            totalBudget += b.amount; // Accumulate global budget
            
            // Remove from map to track what's left
            expenseMap.delete(b.category);

            return {
                category: b.category,
                budgeted: b.amount,
                spent: spent,
                // Don't let remaining go below 0 visually
                remaining: Math.max(0, b.amount - spent), 
                // Flag for UI to show red text if over budget
                isOverBudget: spent > b.amount,
                // Cap progress bar at 100%
                percentage: Math.min(100, (spent / b.amount) * 100)
            };
        });

        // Query 3: Get GRAND TOTAL spent (including unbudgeted categories)
        const totalSpentResult = db.prepare(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE userId = ? AND type = 'EXPENSE' AND createdAt >= ? AND createdAt <= ?
        `).get(userId, current.start, current.end);
        
        const totalSpent = totalSpentResult.total || 0;
        const remainingBudget = totalBudget - totalSpent;

        // =========================================================
        // PART B: CHART DATA (Last 6 Months History)
        // =========================================================
        const chartData = [];

        // Loop backwards from 5 down to 0 (6 months total)
        for (let i = 5; i >= 0; i--) {
            const range = getMonthDateRange(i);

            // Get Total Budget for that historical month
            const budgetResult = db.prepare(`
                SELECT SUM(amount) as total 
                FROM budgets 
                WHERE userId = ? AND month = ?
            `).get(userId, range.monthKey);

            // Get Total Expenses for that historical month
            const expenseResult = db.prepare(`
                SELECT SUM(amount) as total 
                FROM transactions 
                WHERE userId = ? AND type = 'EXPENSE' AND createdAt >= ? AND createdAt <= ?
            `).get(userId, range.start, range.end);

            chartData.push({
                label: range.label, // "Jan", "Feb"
                budget: budgetResult?.total || 0,
                expense: expenseResult?.total || 0
            });
        }

        // =========================================================
        // SEND RESPONSE
        // =========================================================
        res.json({
            overview: {
                totalBudget,
                totalSpent,
                remainingBudget
            },
            categories: categoryData,
            chartData: chartData,
        });

    } catch (error) {
        console.error("Budget Controller Error:", error);
        res.status(500).json({ error: "Failed to fetch budget data" });
    }
};

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export const updateBudget = (req, res) => {
    // 1. Auth Check
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const formData = req.body; // { Housing: 0, Food: 20000, ... }
    
    // Validate that we actually sent data
    if (!formData || Object.keys(formData).length === 0) {
        return res.status(400).json({ error: "No budget data provided" });
    }

    const db = openDb();
    const currentMonth = getCurrentMonthKey(); // e.g., "2026-01"

    try {
        // 2. Prepare the Upsert Statement (Insert or Update)
        // We use ON CONFLICT to update the amount if the budget already exists for this month
        const stmt = db.prepare(`
            INSERT INTO budgets (userId, category, amount, month, updatedAt)
            VALUES (@userId, @category, @amount, @month, CURRENT_TIMESTAMP)
            ON CONFLICT(userId, category, month) 
            DO UPDATE SET 
                amount = excluded.amount,
                updatedAt = CURRENT_TIMESTAMP
        `);

        // 3. Run as a Transaction (All or Nothing)
        const updateMany = db.transaction((data) => {
            for (const [category, amount] of Object.entries(data)) {
                // Skip invalid numbers
                if (typeof amount !== 'number') continue;

                stmt.run({
                    userId: userId,
                    category: category,
                    amount: amount,
                    month: currentMonth
                });
            }
        });

        // Execute the transaction
        updateMany(formData);

        res.json({ 
            success: true, 
            message: `Budget updated for ${currentMonth}`,
            month: currentMonth
        });

    } catch (error) {
        console.error("Update Budget Error:", error);
        res.status(500).json({ error: "Failed to update budget" });
    }
};