import { openDb } from "../db/database.js";
import { getMonthDateRange } from "../utils/getMonthRange.js";

export const getBudgetOverview = async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    const db = openDb();

    try {
        const current = getMonthDateRange(0); // Offset 0 = This Month
        
        // 1. Get Budgets
        const budgetsRes = await db.query(`
            SELECT category, amount 
            FROM budgets 
            WHERE "userId" = $1 AND month = $2
        `, [userId, current.monthKey]);
        const budgets = budgetsRes.rows;

        // 2. Get Expenses (Grouped)
        const expensesRes = await db.query(`
            SELECT category, SUM(amount) as total
            FROM transactions 
            WHERE "userId" = $1 
            AND type = 'EXPENSE'
            AND "createdAt" > $2 
            AND "createdAt" <= $3
            GROUP BY category
        `, [userId, current.start, current.end]);

        // Map the results (Parse float because Postgres returns SUM as string)
        const expenseMap = new Map(expensesRes.rows.map(e => [e.category, parseFloat(e.total)]));

        let totalBudget = 0;
        
        const categoryData = budgets.map((b) => {
            const budgetAmount = parseFloat(b.amount); // Ensure number
            const spent = expenseMap.get(b.category) || 0;
            totalBudget += budgetAmount;

            expenseMap.delete(b.category);

            return {
                category: b.category,
                budgeted: budgetAmount,
                spent: spent,
                remaining: Math.max(0, budgetAmount - spent), 
                isOverBudget: spent > budgetAmount,
                percentage: Math.min(100, (spent / budgetAmount) * 100)
            };
        });

        // 3. Get Total Spent
        const totalSpentRes = await db.query(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE "userId" = $1 AND type = 'EXPENSE' AND "createdAt" > $2 AND "createdAt" <= $3
        `, [userId, current.start, current.end]);
        
        const totalSpent = parseFloat(totalSpentRes.rows[0].total) || 0;
        const remainingBudget = totalBudget - totalSpent;

        // 4. Build Chart Data (History)
        const chartData = [];

        // Loop through last 6 months
        // We use a regular for-loop with await to keep it simple and sequential
        for (let i = 5; i >= 0; i--) {
            const range = getMonthDateRange(i);

            const budgetRes = await db.query(`
                SELECT SUM(amount) as total 
                FROM budgets 
                WHERE "userId" = $1 AND month = $2
            `, [userId, range.monthKey]);

            const expenseRes = await db.query(`
                SELECT SUM(amount) as total 
                FROM transactions 
                WHERE "userId" = $1 AND type = 'EXPENSE' AND "createdAt" > $2 AND "createdAt" <= $3
            `, [userId, range.start, range.end]);

            chartData.push({
                label: range.label, 
                budget: parseFloat(budgetRes.rows[0].total) || 0,
                expense: parseFloat(expenseRes.rows[0].total) || 0
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

export const updateBudget = async (req, res) => {
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
    
    // ⚠️ TRANSACTION HANDLING FOR POSTGRES
    // We need a specific client from the pool to run a transaction
    const client = await db.connect();

    try {
        await client.query('BEGIN'); // Start Transaction

        const queryText = `
            INSERT INTO budgets ("userId", category, amount, month, "updatedAt")
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT("userId", category, month) 
            DO UPDATE SET 
                amount = EXCLUDED.amount,
                "updatedAt" = NOW()
        `;

        for (const [category, amount] of Object.entries(formData)) {
            // Ensure amount is a number
            const val = parseFloat(amount);
            if (isNaN(val)) continue;

            await client.query(queryText, [userId, category, val, currentMonth]);
        }

        await client.query('COMMIT'); // Commit Changes

        res.json({ 
            success: true, 
            message: `Budget updated for ${currentMonth}`,
            month: currentMonth
        });

    } catch (error) {
        await client.query('ROLLBACK'); // Undo if error
        console.error("Update Budget Error:", error);
        res.status(500).json({ error: "Failed to update budget" });
    } finally {
        client.release(); // Release client back to pool
    }
};