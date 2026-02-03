import { openDb } from "../db/database.js";
import { generateFinancialInsight } from "../utils/aiService.js";
import { getMonthDateRange } from "../utils/getMonthRange.js"; // Assuming this handles your date logic

export const getInsight = async (req, res) => {
    const userId = req.session.userId;
    const { type, timezone = "UTC" } = req.body; // Default to UTC if not sent

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!['DASHBOARD', 'BUDGET'].includes(type)) {
        return res.status(400).json({ error: "Invalid insight type" });
    }

    const db = openDb();

    try {
        // 1. CHECK CACHE
        const cachedInsight = db.prepare(`
            SELECT content FROM ai_insights 
            WHERE userId = ? AND type = ? AND expiresAt > datetime('now')
            ORDER BY createdAt DESC LIMIT 1
        `).get(userId, type);

        if (cachedInsight) {
            console.log(`⚡ Serving cached ${type} insight`);
            return res.json({ insight: cachedInsight.content, source: 'cache' });
        }

        // 2. CHECK GLOBAL DATA
        const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE userId = ?').get(userId);
        if (txCount.count === 0) {
            return res.json({ 
                insight: "Welcome to FinPrime! Start adding your income and expenses to unlock personalized AI insights.", 
                source: 'default' 
            });
        }

        console.log(`🤖 Generating new ${type} insight...`);
        
        let contextData = {};

        if (type === 'DASHBOARD') {
            // Dashboard: Always look at the last 30 days for a "Health Check"
            const rawTxs = db.prepare(`
                SELECT transactionName, amount, type, category, createdAt 
                FROM transactions 
                WHERE userId = ? AND createdAt >= date('now', '-30 days')
                ORDER BY createdAt DESC
            `).all(userId);

            const summary = rawTxs.reduce((acc, curr) => {
                if (curr.type === 'INCOME') acc.totalIncome += curr.amount;
                if (curr.type === 'EXPENSE') acc.totalExpense += curr.amount;
                return acc;
            }, { totalIncome: 0, totalExpense: 0 });

            const recentTransactions = rawTxs.map(t => ({
                date: t.createdAt, 
                name: t.transactionName,
                amt: t.amount,
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
            
            // 2. Get Budget Goals (Always for the current active month)
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            const budgetTargets = db.prepare('SELECT category, amount FROM budgets WHERE userId = ? AND month = ?').all(userId, currentMonthStr);
            
            // 3. Try fetching CURRENT month expenses
            const rawTxs = db.prepare(`
                SELECT transactionName, amount, category, createdAt 
                FROM transactions 
                WHERE userId = ? 
                AND type = 'EXPENSE' 
                AND createdAt > ? AND createdAt <= ?
                ORDER BY amount DESC
            `).all(userId, current.start, current.end);
            
            const rawTxs2 = db.prepare(`
                SELECT transactionName, amount, category, createdAt 
                FROM transactions 
                WHERE userId = ? 
                AND type = 'EXPENSE' 
                AND createdAt > ? AND createdAt <= ?
                ORDER BY amount DESC
            `).all(userId, last.start, current.end);

            // 5. Calculate Totals (Help the AI by doing the math here)
            const categoryActuals = rawTxs.reduce((acc, curr) => {
                acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
                return acc;
            }, {});

            // 6. Format History
            const txHistory = rawTxs2.map(t => ({
                item: t.transactionName,
                amt: t.amount,
                cat: t.category,
                date: t.createdAt
            }));

            contextData = {
                timezone: timezone, // Tells AI if we are tracking live or reviewing history
                budgetPlan: budgetTargets,     
                spendingSummary: categoryActuals, 
                transactionDetails: txHistory      
            };
        }

        // 3. CALL AI SERVICE
        const newInsightText = await generateFinancialInsight(contextData, type);

        if (!newInsightText) {
            return res.status(500).json({ error: "Failed to generate insight" });
        }

        // 4. SAVE TO DB (Budget tips last longer: 4 days)
        const daysToAdd = type === 'DASHBOARD' ? 2 : 4;
        const expiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

        db.prepare(`
            INSERT INTO ai_insights (userId, type, content, expiresAt)
            VALUES (?, ?, ?, ?)
        `).run(userId, type, newInsightText, expiresAt);

        return res.json({ insight: newInsightText, source: 'api' });

    } catch (error) {
        console.error("Insight Controller Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};