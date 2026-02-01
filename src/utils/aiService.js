import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

// 1. Initialize the Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 2. Define the Model (Updated to the Preview version you found)
const modelId = "gemini-3-flash-preview"; 

export const generateFinancialInsight = async (userContext, type) => {
    try {
        let systemInstruction = "";
        let userPrompt = "";

        if (type === 'DASHBOARD') {
            systemInstruction = "You are FinPrime AI, a personal financial assistant for Nigerian users. Your goal is to give a concise, 2-sentence summary of their current financial health based on the data provided. Be professional, encouraging, and realistic. Focus on spending habits and savings potential. Use Naira (₦) for currency.";
            userPrompt = `Here is the user's data for the last 30 days:\n${JSON.stringify(userContext)}`;
        } else if (type === 'BUDGET') {
            systemInstruction = "You are a strict but helpful financial planner. Analyze the user's budget vs actual spending. Identify the biggest area of overspending and give 1 specific, actionable tip to fix it. Keep it under 3 sentences. Use Naira (₦).";
            userPrompt = `Budget Data:\n${JSON.stringify(userContext)}`;
        }

        // 3. Call the API (Adapted to our cleaner syntax)
        const response = await ai.models.generateContent({
            model: modelId,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7, 
                maxOutputTokens: 8000, // Added based on your snippet to keep costs low
            },
            contents: [
                { role: 'user', parts: [{ text: userPrompt }] }
            ]
        });

        // 4. Extract Text
        // The new SDK often returns .text() directly on the response object
        const text = response.text; 
        return text ? text.trim() : "No insight generated.";

    } catch (error) {
        console.error("❌ Gemini API Error:", error);
        return null;
    }
};