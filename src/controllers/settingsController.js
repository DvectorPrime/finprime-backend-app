import { openDb } from '../db/database.js';

export const getSettings = (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const db = openDb();

    try {
        const data = db.prepare(`
            SELECT 
                u.firstName, 
                u.lastName, 
                u.email, 
                u.avatar,
                s.themePreference, 
                s.currency, 
                s.aiInsights, 
                s.budgetAlerts
            FROM users u
            LEFT JOIN settings s ON u.id = s.userId
            WHERE u.id = ?
        `).get(userId);

        if (!data) {
            return res.status(404).json({ error: "User not found" });
        }

        // SQLite stores booleans as 0 or 1.
        // We convert them back to true/false for the Frontend React components.
        const formattedData = {
            ...data,
            aiInsights: Boolean(data.aiInsights),   // 1 -> true, 0 -> false
            budgetAlerts: Boolean(data.budgetAlerts),
            themePreference: data.themePreference || 'System',
            currency: data.currency || 'NGN'
        };

        res.json(formattedData);

    } catch (error) {
        console.error("Get Settings Error:", error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
};

export const updateSettings = (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No changes provided" });
    }

    const db = openDb();

    const userFields = ['firstName', 'lastName', 'avatar'];
    const settingFields = ['themePreference', 'currency', 'aiInsights', 'budgetAlerts'];

    try {
        const updateTransaction = db.transaction((data) => {
            
            const userUpdates = [];
            const userValues = [];

            for (const key of Object.keys(data)) {
                if (userFields.includes(key)) {
                    userUpdates.push(`${key} = ?`);
                    userValues.push(data[key]);
                }
            }

            if (userUpdates.length > 0) {
                // Add updatedAt timestamp
                userUpdates.push("updatedAt = CURRENT_TIMESTAMP");
                // Add userId to the end of the values array for the WHERE clause
                userValues.push(userId);

                const sql = `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`;
                db.prepare(sql).run(...userValues);
            }

            const settingUpdates = [];
            const settingValues = [];

            for (const key of Object.keys(data)) {
                if (settingFields.includes(key)) {
                    settingUpdates.push(`${key} = ?`);

                    let val = data[key];
                    if (typeof val === 'boolean') {
                        val = val ? 1 : 0;
                    }
                    settingValues.push(val);
                }
            }

            if (settingUpdates.length > 0) {
                settingUpdates.push("updatedAt = CURRENT_TIMESTAMP");
                settingValues.push(userId);

                const sql = `UPDATE settings SET ${settingUpdates.join(', ')} WHERE userId = ?`;
                const info = db.prepare(sql).run(...settingValues);

                // Edge Case: If settings row doesn't exist yet 
                if (info.changes === 0) {
                   console.warn(`Warning: No settings found for user ${userId}`);
                }
            }
        });

        updateTransaction(updates);

        res.json({ success: true, message: "Settings updated successfully" });

    } catch (error) {
        console.error("Settings Update Error:", error);

        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: "Email already in use" });
        }

        res.status(500).json({ error: "Failed to update settings" });
    }
};