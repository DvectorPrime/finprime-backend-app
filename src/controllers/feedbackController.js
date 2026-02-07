import { openDb } from "../db/database.js";

export async function submitFeedback(req, res) {
    const db = openDb();
    
    // 1. Get data from the frontend
    const { email, message } = req.body;
    const userId = req.session.userId

    if (!userId){
        return res.status(401).json({error : "Unauthorized"})
    }
    
    // 2. Simple Validation
    if (!email || !message) {
        return res.status(400).json({ error: "Email and message are required." });
    }

    try {
        // 3. Insert into Database
        await db.query(`
            INSERT INTO feedback (email, message, "userId")
            VALUES ($1, $2, $3)
        `, [email, message, userId]);

        // 4. Send Success Response
        return res.status(201).json({ 
            success: true, 
            message: "Thank you for your feedback! 🚀" 
        });

    } catch (err) {
        console.error("Feedback Error:", err);
        return res.status(500).json({ error: "Failed to submit feedback." });
    }
}