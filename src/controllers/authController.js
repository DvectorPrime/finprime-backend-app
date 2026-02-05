import bcrypt from "bcryptjs";
import { openDb } from "../db/database.js";
import { sendEmail } from "../utils/emailService.js";

// --- ME CONTROLLER (Check Session) ---
export async function meController(req, res) {
    const db = openDb();
    const id = req.session.userId;

    if (!id) {
        return res.json({ isAuthenticated: false, user: null });
    }

    try {
        const query = `
            SELECT 
                u."firstName", u."lastName", u.email, u.avatar, u."googleId", u.password, 
                s."themePreference", s.currency, s."aiInsights", s."budgetAlerts"
            FROM users u
            LEFT JOIN settings s ON u.id = s."userId"
            WHERE u.id = $1
        `;

        const result = await db.query(query, [id]);
        const data = result.rows[0];

        if (!data) {
            return res.status(401).json({ isAuthenticated: false, error: "User Not Found." });
        }

        return res.json({
            isAuthenticated: true,
            user: {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                avatarUrl: data.avatar || "",
                themePreference: data.themePreference || "System",
                currencyPreference: data.currency || "NGN",
                aiInsights: data.aiInsights === true, 
                budgetAlerts: data.budgetAlerts === true,
                isGoogleAccount: !!data.googleId,
                hasPassword: !!data.password && data.password.length > 0
            }
        });
    } catch (err) {
        console.error("Me Controller Error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}

// --- LOGIN ---
export async function login(req, res) {
    const db = openDb();
    const { email, password } = req.body;

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid Email Address" });
    }

    try {
        const result = await db.query('SELECT id, password AS hash FROM users WHERE email = $1', [email]);
        const data = result.rows[0];

        if (!data) {
            return res.status(400).json({ error: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, data.hash);

        if (!isPasswordValid) {
            return res.status(400).json({ error: "Incorrect Password" });
        }

        req.session.userId = data.id;
        console.log("Login User ID:", req.session.userId);

        res.json({ message: "Login Successful" });

    } catch (err) {
        console.error("Login Error:", err);
        return res.status(500).json({ error: "An error occurred" });
    }
}

// --- REGISTER ---
export async function register(req, res) {
    const db = openDb();
    let { firstName, lastName, email, password, code } = req.body;

    if (!firstName || !lastName || !email || !password || !code) {
        return res.status(400).json({ error: "All fields including verification code are required" });
    }

    try {
        // 1. VERIFICATION STEP
        // FIX: Replaced NOW() with $3 (currentTime) to ensure timezone consistency
        const currentTime = new Date().toISOString();
        
        const codeRes = await db.query(`
            SELECT id FROM verification_codes 
            WHERE email = $1 AND code = $2 AND type = 'REGISTRATION' 
            AND "expiresAt" > $3
            ORDER BY "createdAt" DESC LIMIT 1
        `, [email, code.toString(), currentTime]);

        const validCode = codeRes.rows[0];

        if (!validCode) {
            return res.status(400).json({ error: "Invalid or expired verification code" });
        }

        firstName = firstName.split(" ")[0];
        const passwordHash = await bcrypt.hash(password, 10);

        // 2. Check for existing user
        const existingUserRes = await db.query('SELECT email FROM users WHERE email = $1', [email]);
        if (existingUserRes.rows.length > 0) {
            return res.status(400).json({ error: "User already exists" });
        }

        // 3. Create User
        const insertUserRes = await db.query(`
            INSERT INTO users (email, "firstName", "lastName", password, avatar) 
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [email, firstName, lastName, passwordHash, ""]);
        
        const userId = insertUserRes.rows[0].id;

        // 4. Create Settings
        await db.query('INSERT INTO settings ("userId") VALUES ($1)', [userId]);

        // 5. Cleanup Code
        await db.query('DELETE FROM verification_codes WHERE id = $1', [validCode.id]);

        req.session.userId = userId;
        return res.json({ success: "Account Verified & Created Successfully", firstName });

    } catch (err) {
        console.error("Registration Error", err);
        return res.status(500).json({ error: "Database error during registration" });
    }
}

// --- SEND CODE ---
export async function sendRegistrationCode(req, res) {
    const { email, firstName } = req.body;
    const db = openDb();

    try {
        const userRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length > 0) {
            return res.status(400).json({ error: "User already exists. Please login." });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60000).toISOString(); 

        await db.query(`
            INSERT INTO verification_codes (email, code, type, "expiresAt") 
            VALUES ($1, $2, 'REGISTRATION', $3)
        `, [email, code, expiresAt]);

        const emailSent = await sendEmail(email, firstName, code, 'REGISTRATION');
        
        if (!emailSent) throw new Error("Failed to send email via Brevo");

        res.json({ success: true, message: "Verification code sent!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send verification code" });
    }
}

// --- GOOGLE AUTH ---
export async function googleAuth(req, res) {
    const { code } = req.body;
    const db = openDb();
    let googleUser;

    try {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: 'http://localhost:3000/login',
                grant_type: 'authorization_code',
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            throw new Error(`Google Token Error: ${errorData.error_description || tokenResponse.statusText}`);
        }

        const googleTokens = await tokenResponse.json();

        const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
            method: 'GET',
            headers: { Authorization: `Bearer ${googleTokens.access_token}` },
        });

        if (!userResponse.ok) throw new Error(`Google User Info Error: ${userResponse.statusText}`);

        googleUser = await userResponse.json();

        const findUserRes = await db.query(
            'SELECT * FROM users WHERE "googleId" = $1 OR email = $2', 
            [googleUser.id, googleUser.email]
        );
        let user = findUserRes.rows[0];

        if (user) {
            if (!user.googleId) {
                await db.query(
                    'UPDATE users SET "googleId" = $1, avatar = $2 WHERE email = $3', 
                    [googleUser.id, googleUser.picture, googleUser.email]
                );
                
                const settingsRes = await db.query('SELECT id FROM settings WHERE "userId" = $1', [user.id]);
                if (settingsRes.rows.length === 0) {
                     await db.query('INSERT INTO settings ("userId") VALUES ($1)', [user.id]);
                }
            }
        } else {
            const insertRes = await db.query(`
                INSERT INTO users (email, "googleId", "firstName", "lastName", avatar) 
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [googleUser.email, googleUser.id, googleUser.given_name, googleUser.family_name, googleUser.picture]);
            
            const newUserId = insertRes.rows[0].id;

            await db.query('INSERT INTO settings ("userId") VALUES ($1)', [newUserId]);
            user = { id: newUserId };
        }

        req.session.userId = user.id;
        res.json({ success: "Authentication Successful" });

    } catch (err) {
        console.log({ error: err.message });
        return res.status(500).json({ error: "Authentication Failed due to server Error." });
    }
}

// --- LOGOUT ---
export async function logOutUser(req, res) {
    req.session.destroy(() => {
        res.json({ message: 'Logged out' });
    });
}

// --- CHANGE PASSWORD ---
export const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;

    if (!userId) return res.status(401).json({ error: "Unauthorized." });
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    const db = openDb();

    try {
        const userRes = await db.query('SELECT password FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        if (!user) return res.status(404).json({ error: "User not found." });

        const userHasPassword = !!user.password && user.password.length > 0;

        if (userHasPassword) {
            if (!currentPassword) {
                return res.status(400).json({ error: "Current password is required." });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: "Incorrect current password." });
            }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        return res.json({ success: true, message: "Password updated successfully." });

    } catch (error) {
        console.error("Change Password Error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
};

// --- FORGOT PASSWORD ---
export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const db = openDb();

    try {
        const userRes = await db.query('SELECT "firstName", "googleId" FROM users WHERE email = $1', [email]);
        const user = userRes.rows[0];

        if (!user) {
            return res.json({ success: true, message: "If an account exists, a code has been sent." });
        }

        if (user.googleId) {
            return res.status(400).json({ error: "This account uses Google Sign-In. Please sign in with Google." });
        }

        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await db.query(`
            INSERT INTO verification_codes (email, code, type, "expiresAt") 
            VALUES ($1, $2, 'PASSWORD_RESET', $3)
        `, [email, pin, expiresAt]);

        const sent = await sendEmail(email, user.firstName, pin, 'PASSWORD_RESET');
        if (!sent) throw new Error("Failed to send email");

        res.json({ success: true, message: "Verification code sent to your email." });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ error: "Failed to send verification code." });
    }
};

// --- RESET PASSWORD ---
export const resetPasswordWithPin = async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) return res.status(400).json({ error: "All fields required." });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password too short." });

    const db = openDb();

    try {
        // 1. Verify Code
        // FIX: Replaced NOW() with $3 (currentTime) to ensure timezone consistency
        const currentTime = new Date().toISOString();

        const codeRes = await db.query(`
            SELECT id FROM verification_codes 
            WHERE email = $1 AND code = $2 AND type = 'PASSWORD_RESET' 
            AND "expiresAt" > $3
            ORDER BY "createdAt" DESC LIMIT 1
        `, [email, code, currentTime]);

        const validCode = codeRes.rows[0];

        if (!validCode) {
            return res.status(400).json({ error: "Invalid or expired verification code." });
        }

        // 2. Hash & Update
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);

        // 3. Cleanup
        await db.query('DELETE FROM verification_codes WHERE id = $1', [validCode.id]);

        res.json({ success: true, message: "Password reset successfully. You can now login." });

    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};

// --- DELETE ACCOUNT ---
export const deleteAccount = async (req, res) => {
    const { password } = req.body;
    const userId = req.session.userId;

    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    const db = openDb();

    try {
        const userRes = await db.query('SELECT email, password, "createdAt", "googleId" FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        if (!user) return res.status(404).json({ error: "User not found." });

        if (!user.googleId) {
            if (!password) return res.status(400).json({ error: "Password is required." });
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ error: "Incorrect password." });
        }

        await db.query(`
            INSERT INTO deleted_users (email, "originalUserId", "userCreatedAt") 
            VALUES ($1, $2, $3)
        `, [user.email, userId, user.createdAt]);

        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        req.session.destroy((err) => {
            if (err) return res.status(500).json({ error: "Failed to log out." });
            res.clearCookie('connect.sid');
            return res.json({ success: true, message: "Account deleted." });
        });

    } catch (error) {
        console.error("Delete Error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
};