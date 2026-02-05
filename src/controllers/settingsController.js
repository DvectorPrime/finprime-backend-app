import { openDb } from '../db/database.js';

export const getSettings = async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = openDb();

    try {
        const query = `
            SELECT 
                u."firstName", 
                u."lastName", 
                u.email, 
                u.avatar,
                s."themePreference", 
                s.currency, 
                s."aiInsights", 
                s."budgetAlerts"
            FROM users u
            LEFT JOIN settings s ON u.id = s."userId"
            WHERE u.id = $1
        `;

        const result = await db.query(query, [userId]);
        const data = result.rows[0];

        if (!data) {
            return res.status(404).json({ error: "User not found" });
        }

        // Postgres returns actual Booleans, so we don't need to convert 1/0
        const formattedData = {
            ...data,
            // Ensure defaults if null
            aiInsights: data.aiInsights ?? true, 
            budgetAlerts: data.budgetAlerts ?? false,
            themePreference: data.themePreference || 'System',
            currency: data.currency || 'NGN'
        };

        res.json(formattedData);

    } catch (error) {
        console.error("Get Settings Error:", error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
};

export const updateSettings = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No changes provided" });
    }

    const db = openDb();
    
    // ⚠️ Get a dedicated client for the transaction
    const client = await db.connect();

    const userFields = ['firstName', 'lastName', 'avatar'];
    const settingFields = ['themePreference', 'currency', 'aiInsights', 'budgetAlerts'];

    try {
        await client.query('BEGIN'); // Start Transaction

        // --- 1. UPDATE USERS TABLE ---
        const userUpdates = [];
        const userValues = [];
        let uIdx = 1; // Placeholder counter ($1, $2...)

        for (const key of Object.keys(updates)) {
            if (userFields.includes(key)) {
                userUpdates.push(`"${key}" = $${uIdx}`);
                userValues.push(updates[key]);
                uIdx++;
            }
        }

        if (userUpdates.length > 0) {
            // Add Timestamp
            userUpdates.push(`"updatedAt" = NOW()`);
            
            // Add ID for WHERE clause
            userValues.push(userId);
            
            const sql = `UPDATE users SET ${userUpdates.join(', ')} WHERE id = $${uIdx}`;
            await client.query(sql, userValues);
        }

        // --- 2. UPDATE SETTINGS TABLE ---
        const settingUpdates = [];
        const settingValues = [];
        let sIdx = 1; // Reset counter for new query

        for (const key of Object.keys(updates)) {
            if (settingFields.includes(key)) {
                settingUpdates.push(`"${key}" = $${sIdx}`);
                settingValues.push(updates[key]); // Postgres handles boolean true/false automatically
                sIdx++;
            }
        }

        if (settingUpdates.length > 0) {
            settingUpdates.push(`"updatedAt" = NOW()`);
            settingValues.push(userId);

            const sql = `UPDATE settings SET ${settingUpdates.join(', ')} WHERE "userId" = $${sIdx}`;
            const info = await client.query(sql, settingValues);

            // Edge Case: Settings row might not exist (though init/auth should have created it)
            if (info.rowCount === 0) {
                 console.warn(`Warning: No settings found for user ${userId}`);
            }
        }

        await client.query('COMMIT'); // Commit Transaction
        res.json({ success: true, message: "Settings updated successfully" });

    } catch (error) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error("Settings Update Error:", error);

        // Postgres Error Code 23505 is Unique Violation
        if (error.code === '23505') {
            return res.status(409).json({ error: "Email already in use" });
        }

        res.status(500).json({ error: "Failed to update settings" });
    } finally {
        client.release(); // Release client back to pool
    }
};