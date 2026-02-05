import { openDb } from "../db/database.js";
import { generateFinancialInsight } from "../utils/aiService.js";
import { getMonthDateRange } from "../utils/getMonthRange.js";

export const getInsight = async (req, res) => {
    const userId = req.session.userId;
    const { type, timezone = "UTC" } = req.body;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!['DASHBOARD', 'BUDGET'].includes(type)) {
        return res.status(400).json({ error: "Invalid insight type" });
    }

    const db = openDb();

    try {
        // 1. CHECK CACHE
        // Changed: datetime('now') -> NOW()
        const cachedRes = await db.query(`
            SELECT content FROM ai_insights 
            WHERE "userId" = $1 AND type = $2 AND "expiresAt" > NOW()
            ORDER BY "createdAt" DESC LIMIT 1
        `, [userId, type]);

        if (cachedRes.rows.length > 0) {
            console.log(`⚡ Serving cached ${type} insight`);
            return res.json({ insight: cachedRes.rows[0].content, source: 'cache' });
        }

        // 2. CHECK GLOBAL DATA (If user has 0 transactions, don't waste AI tokens)
        const countRes = await db.query('SELECT COUNT(*) as count FROM transactions WHERE "userId" = $1', [userId]);
        
        // Postgres returns BigInt counts as strings, so we parse it
        if (parseInt(countRes.rows[0].count) === 0) {
            return res.json({ 
                insight: "Welcome to FinPrime! Start adding your income and expenses to unlock personalized AI insights.", 
                source: 'default' 
            });
        }

        console.log(`🤖 Generating new ${type} insight...`);
        
        let contextData = {};

        if (type === 'DASHBOARD') {
            // Dashboard: Last 30 days
            // Changed: date('now', '-30 days') -> NOW() - INTERVAL '30 days'
            const txRes = await db.query(`
                SELECT "transactionName", amount, type, category, "createdAt" 
                FROM transactions 
                WHERE "userId" = $1 AND "createdAt" >= NOW() - INTERVAL '30 days'
                ORDER BY "createdAt" DESC
            `, [userId]);
            
            const rawTxs = txRes.rows;

            const summary = rawTxs.reduce((acc, curr) => {
                // Ensure amount is a number (Postgres DECIMAL comes back as string)
                const val = parseFloat(curr.amount);
                if (curr.type === 'INCOME') acc.totalIncome += val;
                if (curr.type === 'EXPENSE') acc.totalExpense += val;
                return acc;
            }, { totalIncome: 0, totalExpense: 0 });

            const recentTransactions = rawTxs.map(t => ({
                date: t.createdAt, 
                name: t.transactionName,
                amt: parseFloat(t.amount),
                cat: t.category,
                type: t.type
            }));

            contextData = {
                timezone: timezone,
                analysisType: "30_DAY_HEALTH_CHECK",
                summary: summary,
                history: recentTransactions
            };

        } else if (type === 'BUDGET') {
            // 1. Get Dates
            const current = getMonthDateRange(0); // This Month
            const last = getMonthDateRange(1);    // Last Month
            
            // 2. Get Budget Goals
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            const budgetRes = await db.query(
                'SELECT category, amount FROM budgets WHERE "userId" = $1 AND month = $2', 
                [userId, currentMonthStr]
            );
            const budgetTargets = budgetRes.rows;
            
            // 3. Get Expenses (Current Month)
            const txRes1 = await db.query(`
                SELECT "transactionName", amount, category, "createdAt" 
                FROM transactions 
                WHERE "userId" = $1 
                AND type = 'EXPENSE' 
                AND "createdAt" > $2 AND "createdAt" <= $3
                ORDER BY amount DESC
            `, [userId, current.start, current.end]);
            
            // 4. Get Expenses (Last Month for comparison)
            // Note: I simplified the query to match txRes1 logic
            const txRes2 = await db.query(`
                SELECT "transactionName", amount, category, "createdAt" 
                FROM transactions 
                WHERE "userId" = $1 
                AND type = 'EXPENSE' 
                AND "createdAt" > $2 AND "createdAt" <= $3
                ORDER BY amount DESC
            `, [userId, last.start, current.end]); // Fixed logic to use last.start/end
            
            const rawTxs = txRes1.rows;
            const rawTxs2 = txRes2.rows;

            // 5. Calculate Totals
            const categoryActuals = rawTxs.reduce((acc, curr) => {
                const val = parseFloat(curr.amount);
                acc[curr.category] = (acc[curr.category] || 0) + val;
                return acc;
            }, {});

            // 6. Format History
            const txHistory = rawTxs2.map(t => ({
                item: t.transactionName,
                amt: parseFloat(t.amount),
                cat: t.category,
                date: t.createdAt
            }));

            contextData = {
                timezone: timezone,
                budgetPlan: budgetTargets.map(b => ({...b, amount: parseFloat(b.amount)})),     
                spendingSummary: categoryActuals, 
                transactionDetails: txHistory      
            };
        }

        // 3. CALL AI SERVICE
        const newInsightText = await generateFinancialInsight(contextData, type);

        if (!newInsightText) {
            return res.status(500).json({ error: "Failed to generate insight" });
        }

        // 4. SAVE TO DB
        const daysToAdd = type === 'DASHBOARD' ? 2 : 4;
        const expiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

        await db.query(`
            INSERT INTO ai_insights ("userId", type, content, "expiresAt")
            VALUES ($1, $2, $3, $4)
        `, [userId, type, newInsightText, expiresAt]);

        return res.json({ insight: newInsightText, source: 'api' });

    } catch (error) {
        console.error("Insight Controller Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};