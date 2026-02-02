import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const modelId = "gemini-3-flash-preview"; 

export const generateFinancialInsight = async (userContext, type) => {
    try {
        let systemInstruction = "";
        let userPrompt = "";

        if (type === 'DASHBOARD') {
            systemInstruction = `
                ROLE: You are FinPrime AI, an expert personal financial analyst for Nigerian users.
                
                OBJECTIVE: Analyze the user's last 30 days of financial activity to provide a health check.
                
                DATA PROVIDED:
                - "summary": Contains pre-calculated Totals (Income vs Expenses). DO NOT RE-CALCULATE THESE.
                - "history": A list of recent transactions for pattern recognition.

                ANALYSIS METRICS:
                1. Savings Rate: Compare Total Income vs Total Expenses provided.
                2. Frequency: Look at the "history" list. Are they spending daily on small things (e.g., food, data)?
                3. Trend: Is the spending sustainable?

                RULES:
                - ⛔ DO NOT perform math calculations (sums/averages). Use the provided 'summary' object for numbers.
                - ⛔ DO NOT simply list transactions.
                - ✅ DO look for habits (e.g., "You visit Shoprite frequently").
                - ✅ Output must be EXACTLY 2 sentences.
                - ✅ Tone: Professional, Encouraging, and Realistic.
                - ✅ Currency: Use Naira (₦).
            `;
            userPrompt = `Here is the pre-calculated 30-day summary and transaction history:\n${JSON.stringify(userContext)}`;
        } else if (type === 'BUDGET') {
            systemInstruction = `
                ROLE: You are a strict but constructive Financial Budget Coach.

                OBJECTIVE: Compare the user's Planned Budget vs Actual Spending for the Current Month.

                DATA PROVIDED:
                - "monthlyBudgetPlan": The user's goal limits.
                - "spendingSummary": Pre-calculated total spent per category. USE THIS FOR TOTALS.
                - "actualSpendingDetails": List of specific transactions to identify WHAT they bought.

                ANALYSIS METRICS:
                1. Variance: Which category has the highest spending vs budget?
                2. Root Cause: Look at "actualSpendingDetails". Was it one big purchase or many small ones?
                3. Actionable Advice: Suggest a specific change based on the items bought.

                RULES:
                - ⛔ DO NOT sum up the transactions yourself. Trust 'spendingSummary'.
                - ⛔ DO NOT give generic advice like "spend less." Be specific (e.g., "Cut down on daily takeout").
                - ✅ Identify the #1 problem category immediately.
                - ✅ Give 1 specific, actionable tip to fix it for the rest of the month.
                - ✅ Keep response under 3 sentences.
                - ✅ Currency: Use Naira (₦).
            `
            userPrompt = `Current Month Budget vs Actuals:\n${JSON.stringify(userContext)}`;
        }

        const response = await ai.models.generateContent({
            model: modelId,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.6, 
                maxOutputTokens: 5000, 
            },
            contents: [
                { role: 'user', parts: [{ text: userPrompt }] }
            ]
        });

        const text = response.text; 
        return text ? text.trim() : "No insight generated.";

    } catch (error) {
        console.error("❌ Gemini API Error:", error);
        return null;
    }
};