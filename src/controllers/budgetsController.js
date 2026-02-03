import { openDb } from "../db/database.js";
import { getMonthDateRange } from "../utils/getMonthRange.js"

export const getBudgetOverview = (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    try {
        const db = openDb();

        const current = getMonthDateRange(0); // Offset 0 = This Month
        const budgets = db.prepare(`
            SELECT category, amount 
            FROM budgets 
            WHERE userId = ? AND month = ?
        `).all(userId, current.monthKey);

        const expenses = db.prepare(`
            SELECT category, SUM(amount) as total
            FROM transactions 
            WHERE userId = ? 
            AND type = 'EXPENSE'
            AND createdAt > ? 
            AND createdAt <= ?
            GROUP BY category
        `).all(userId, current.start, current.end);
            
        console.log(current)
        console.log(expenses)

        const expenseMap = new Map(expenses.map(e => [e.category, e.total]));

        let totalBudget = 0;
        
        const categoryData = budgets.map((b) => {
            const spent = expenseMap.get(b.category) || 0;
            totalBudget += b.amount;

            expenseMap.delete(b.category);

            return {
                category: b.category,
                budgeted: b.amount,
                spent: spent,
                remaining: Math.max(0, b.amount - spent), 
                isOverBudget: spent > b.amount,
                percentage: Math.min(100, (spent / b.amount) * 100)
            };
        });

        const totalSpentResult = db.prepare(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE userId = ? AND type = 'EXPENSE' AND createdAt > ? AND createdAt <= ?
        `).get(userId, current.start, current.end);
        
        const totalSpent = totalSpentResult.total || 0;
        const remainingBudget = totalBudget - totalSpent;

        const chartData = [];

        for (let i = 5; i >= 0; i--) {
            const range = getMonthDateRange(i);

            const budgetResult = db.prepare(`
                SELECT SUM(amount) as total 
                FROM budgets 
                WHERE userId = ? AND month = ?
            `).get(userId, range.monthKey);

            const expenseResult = db.prepare(`
                SELECT SUM(amount) as total 
                FROM transactions 
                WHERE userId = ? AND type = 'EXPENSE' AND createdAt > ? AND createdAt <= ?
            `).get(userId, range.start, range.end);

            chartData.push({
                label: range.label, 
                budget: budgetResult?.total || 0,
                expense: expenseResult?.total || 0
            });
        }

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
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const formData = req.body; 
    
    if (!formData || Object.keys(formData).length === 0) {
        return res.status(400).json({ error: "No budget data provided" });
    }

    const db = openDb();
    const currentMonth = getCurrentMonthKey();

    try {
        const stmt = db.prepare(`
            INSERT INTO budgets (userId, category, amount, month, updatedAt)
            VALUES (@userId, @category, @amount, @month, CURRENT_TIMESTAMP)
            ON CONFLICT(userId, category, month) 
            DO UPDATE SET 
                amount = excluded.amount,
                updatedAt = CURRENT_TIMESTAMP
        `);

        const updateMany = db.transaction((data) => {
            for (const [category, amount] of Object.entries(data)) {
                if (typeof amount !== 'number') continue;

                stmt.run({
                    userId: userId,
                    category: category,
                    amount: amount,
                    month: currentMonth
                });
            }
        });

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