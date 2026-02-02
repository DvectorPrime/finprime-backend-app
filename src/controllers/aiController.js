import { openDb } from "../db/database.js";
import { generateFinancialInsight } from "../utils/aiService.js";
import { getMonthDateRange } from "../utils/getMonthRange.js";

export const getInsight = async (req, res) => {
    const userId = req.session.userId;
    const { type } = req.body; 

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!['DASHBOARD', 'BUDGET'].includes(type)) {
        return res.status(400).json({ error: "Invalid insight type" });
    }

    const db = openDb();

    try {
        const cachedInsight = db.prepare(`
            SELECT content FROM ai_insights 
            WHERE userId = ? AND type = ? AND expiresAt > datetime('now')
            ORDER BY createdAt DESC LIMIT 1
        `).get(userId, type);

        if (cachedInsight) {
            console.log(`⚡ Serving cached ${type} insight`);
            return res.json({ insight: cachedInsight.content, source: 'cache' });
        }

        const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE userId = ?').get(userId);

        if (txCount.count === 0) {
            return res.json({ 
                insight: "Welcome to FinPrime! Start adding your income and expenses to unlock personalized AI insights.", 
                source: 'default' 
            });
        }

        console.log(`🤖 Generating new ${type} insight...`);
        
        let contextData = {};
        const current = getMonthDateRange(0)
        const last = getMonthDateRange(1)

        if (type === 'DASHBOARD') {
            // const rawTxs = db.prepare(`
            //     SELECT transactionName, amount, type, category, createdAt 
            //     FROM transactions 
            //     WHERE userId = ? AND createdAt >= ? AND createdAt <= ?
            //     ORDER BY createdAt DESC
            // `).all(userId,last.start, current.end);

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
                date: t.createdAt.split('T')[0], 
                name: t.transactionName,
                amt: t.amount,
                cat: t.category,
                type: t.type
            }));

            contextData = {
                summary: summary,
                history: recentTransactions
            };

        } else if (type === 'BUDGET') {
            const currentMonth = new Date().toISOString().slice(0, 7); // e.g., "2026-02"
            
            const budgetTargets = db.prepare('SELECT category, amount FROM budgets WHERE userId = ? AND month = ?').all(userId, currentMonth);
            
            // let rawTxs = db.prepare(`
            //     SELECT transactionName, amount, category, createdAt 
            //     FROM transactions 
            //     WHERE userId = ? 
            //     AND type = 'EXPENSE' 
            //     AND createdAt LIKE ? 
            //     ORDER BY amount DESC
            // `).all(userId, `${currentMonth}%`);

            let rawTxs = db.prepare(`
                SELECT transactionName, amount, category, createdAt 
                FROM transactions 
                WHERE userId = ? 
                AND type = 'EXPENSE' 
                AND createdAt >= ? 
                AND createdAt <= ?
                ORDER BY createdAt DESC
            `).all(userId, last.start, current.end);

            let rawTxs2 = db.prepare(`
                SELECT transactionName, amount, category, createdAt 
                FROM transactions 
                WHERE userId = ? 
                AND type = 'EXPENSE' 
                AND createdAt >= ? 
                AND createdAt <= ?
                ORDER BY createdAt DESC
            `).all(userId, current.start, current.end);

            const categoryActuals = rawTxs2.reduce((acc, curr) => {
                acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
                return acc;
            }, {});

            const txHistory = rawTxs.map(t => ({
                item: t.transactionName,
                amt: t.amount,
                cat: t.category,
                date: t.createdAt.split('T')[0] 
            }));

            contextData = {
                monthlyBudgetPlan: budgetTargets,     
                spendingSummaryForThisMonth: categoryActuals, 
                actualSpendingDetailsForPastTwoMonths: txHistory      
            };
        }

        const newInsightText = await generateFinancialInsight(contextData, type);

        if (!newInsightText) {
            return res.status(500).json({ error: "Failed to generate insight" });
        }

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