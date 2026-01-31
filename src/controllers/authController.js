import bcrypt from "bcryptjs"
import { openDb } from "../db/database.js"
import { sendEmail } from "../utils/emailService.js"

export async function meController(req, res) {
    const db = openDb()
    const id = req.session.userId

    if (!id){
        return res.json({ isAuthenticated : false, user: null})
    }

    const stmt = db.prepare(`
        SELECT 
            u.firstName, u.lastName, u.email, u.avatar, u.googleId, u.password, -- Get password field
            s.themePreference, s.currency, s.aiInsights, s.budgetAlerts
        FROM users u
        LEFT JOIN settings s ON u.id = s.userId
        WHERE u.id = ?
    `)
    
    const data = stmt.get(id) || null

    if (!data){
        return res.status(401).json({ isAuthenticated: false, error : "User Not Found."})
    }

    if (!data){
        return res.status(401).json({ isAuthenticated: false, error : "User Not Found."})
    }

    return res.json({ 
        isAuthenticated : true, 
        user: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            avatarUrl: data.avatar || "", 
            themePreference: data.themePreference || "System",
            currencyPreference: data.currency || "NGN",
            aiInsights: data.aiInsights === 1,
            budgetAlerts: data.budgetAlerts === 1,
            // NEW FLAG: Frontend uses this to decide whether to show Password input
            isGoogleAccount: !!data.googleId, 
            hasPassword: !!data.password && data.password.length > 0
        }
    })
}

export async function login(req, res) {
    const db = openDb()

    const { email, password } = req.body

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    
    if (!emailRegex.test(email)){
        return res.status(400).json({error : "Invalid Email Address"})
    }

    try {
        const idStmt = db.prepare('SELECT id, password AS hash FROM users WHERE email = ?')
    
        const data = idStmt.get(email) || {id : null, hash : null}
    
        if (!data.id){ // Fixed check to look for ID specifically
            return res.status(400).json({error : "User not found"})
        }
    
        const isPasswordValid = await bcrypt.compare(password, data.hash)
    
        if (!isPasswordValid){
            return res.status(400).json({error : "Incorrect Password"})
        }
    
        req.session.userId = data.id
    
        console.log("Login User ID:", req.session.userId)
    
        res.json({message: "Login Succesful"})
    } catch (err) {
        console.error("Login Error:", err)
        return res.status(500).json({error: "An error occcured"})
    }

}

export async function register(req, res){
    const db = openDb();

    // Now accepting 'code' from frontend
    let { firstName, lastName, email, password, code } = req.body;

    if (!firstName ||!lastName || !email || !password || !code) {
        return res.status(400).json({error: "All fields including verification code are required"});
    }

    // --- VERIFICATION STEP ---
    const validCode = db.prepare(`
        SELECT id FROM verification_codes 
        WHERE email = ? AND code = ? AND type = 'REGISTRATION' 
        AND expiresAt > datetime('now')
        ORDER BY createdAt DESC LIMIT 1
    `).get(email, code);

    if (!validCode) {
        return res.status(400).json({ error: "Invalid or expired verification code" });
    }
    // -------------------------

    firstName = firstName.split(" ")[0]; 
    const passwordHash = await bcrypt.hash(password, 10);

    // Double check user doesn't exist (race condition safety)
    const emailExists = db.prepare('SELECT email FROM users WHERE email = ?').get(email);
    if (emailExists){
        return res.status(400).json({error : "User already exists"});
    }

    try {
        // Create User
        const createUserStatement = db.prepare('INSERT INTO users (email, firstName, lastName, password, avatar) VALUES (?, ?, ?, ?, ?)');
        const results = createUserStatement.run(email, firstName, lastName, passwordHash, "");
        const userId = results.lastInsertRowid;

        // Create Default Settings
        db.prepare('INSERT INTO settings (userId) VALUES (?)').run(userId);

        // Cleanup: Delete used verification code
        db.prepare('DELETE FROM verification_codes WHERE id = ?').run(validCode.id);

        req.session.userId = userId;
        return res.json({success : "Account Verified & Created Successfully", firstName : firstName});
        
    } catch (err) {
        console.error("Registration Error", err);
        return res.status(500).json({ error: "Database error during registration" });
    }
}

export async function sendRegistrationCode(req, res) {
    const { email, firstName } = req.body;
    const db = openDb();

    // Check if user already exists
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (user) {
        return res.status(400).json({ error: "User already exists. Please login." });
    }

    // Generate 6-digit Code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString(); // 15 mins

    try {
        // Save code to DB
        db.prepare(`
            INSERT INTO verification_codes (email, code, type, expiresAt) 
            VALUES (?, ?, 'REGISTRATION', ?)
        `).run(email, code, expiresAt);

        // Send Email
        const emailSent = await sendEmail(email, firstName, code, 'REGISTRATION');
        
        if (!emailSent) throw new Error("Failed to send email via Brevo");

        res.json({ success: true, message: "Verification code sent!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send verification code" });
    }
}

export async function googleAuth(req, res){
    const {code} = req.body

    const db = openDb()

    let googleUser

    try {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            },
            body: JSON.stringify({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: 'http://localhost:3000/login', 
            grant_type: 'authorization_code',
            })
        })
    
        if (!tokenResponse.ok){
            const errorData = await tokenResponse.json()
            console.log(`Google Token Error: ${errorData.error_description || tokenResponse.statusText}`)
            throw new Error(`Google Token Error: ${errorData.error_description || tokenResponse.statusText}`);
        }
    
        const googleTokens = await tokenResponse.json()
    
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
            method: 'GET',
            headers: {
            Authorization: `Bearer ${googleTokens.access_token}`,
            },
        });
    
        if (!userResponse.ok) {
            throw new Error(`Google User Info Error: ${userResponse.statusText}`);
        }
    
        googleUser = await userResponse.json();
        const findUser = db.prepare('SELECT * FROM users WHERE googleId = ? OR email = ?')
        let user = findUser.get(googleUser.id, googleUser.email)
    
        if (user) {
            // Link account if email matches but googleId is missing
            if(!user.googleId){
                const linkAccount = db.prepare('UPDATE users SET googleId = ?, avatar = ? WHERE email = ?')
                linkAccount.run(googleUser.id, googleUser.picture, googleUser.email)
                
                // Optional: Check if they have settings (in case they registered before this update)
                const checkSettings = db.prepare('SELECT id FROM settings WHERE userId = ?').get(user.id);
                if (!checkSettings) {
                     db.prepare('INSERT INTO settings (userId) VALUES (?)').run(user.id);
                }
            }
        } else {
            // Create NEW User
            const createUser = db.prepare(`
                INSERT INTO users (email, googleId, firstName, lastName, avatar) 
                VALUES (?, ?, ?, ?, ?)
            `);
    
            const result = createUser.run(
                googleUser.email,
                googleUser.id,
                googleUser.given_name,
                googleUser.family_name,
                googleUser.picture
            );
            
            const newUserId = result.lastInsertRowid;

            // UPDATED: Create Default Settings for this new user
            const createSettingsStmt = db.prepare('INSERT INTO settings (userId) VALUES (?)')
            createSettingsStmt.run(newUserId)

            user = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId)
        }

        req.session.userId = user.id
        res.json({success : "Authentication Successful"})
    } catch (err) {
        console.log({error : err.message})
        return res.status(500).json({ error: "Authentication Failed due to server Error. Try again later" })
    }
}

export async function logOutUser(req, res) {
    req.session.destroy(() => {
        res.json({message: 'Logged out'})
    })
}

export const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;

    if (!userId) return res.status(401).json({ error: "Unauthorized." });

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    const db = openDb();

    try {
        const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ error: "User not found." });

        const userHasPassword = !!user.password && user.password.length > 0;

        // === LOGIC BRANCH ===
        // If user HAS a password, they MUST provide the correct current one.
        if (userHasPassword) {
            if (!currentPassword) {
                return res.status(400).json({ error: "Current password is required." });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: "Incorrect current password." });
            }
        } 
        // If user has NO password (Google only), we SKIP the check and let them set one.

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update DB
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);

        return res.json({ success: true, message: "Password updated successfully." });

    } catch (error) {
        console.error("Change Password Error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
};

// 1. REQUEST PASSWORD RESET (Sends PIN)
export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    
    if (!email) return res.status(400).json({ error: "Email is required." });

    const db = openDb();

    try {
        // Check if user exists 
        const user = db.prepare('SELECT firstName, googleId FROM users WHERE email = ?').get(email);

        if (!user) {
            // Security best practice: Don't explicitly say "User not found" to prevent email scraping.
            // But for your UX, we will return success even if user isn't found (or you can show an error if you prefer).
            // Let's return success to pretend we sent it.
            return res.json({ success: true, message: "If an account exists, a code has been sent." });
        }

        if (user.googleId) {
            return res.status(400).json({ error: "This account uses Google Sign-In. Please sign in with Google." });
        }

        // Generate 6-digit PIN
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Set Expiry (15 minutes from now)
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        // Save PIN to DB
        const stmt = db.prepare('INSERT INTO verification_codes (email, code, type, expiresAt) VALUES (?, ?, ?, ?)');
        stmt.run(email, pin, 'PASSWORD_RESET', expiresAt);

        // Send Email via Brevo
        const sent = await sendEmail(email, user.firstName, pin, 'PASSWORD_RESET');

        if (!sent) throw new Error("Failed to send email via service");

        res.json({ success: true, message: "Verification code sent to your email." });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ error: "Failed to send verification code." });
    }
};

// 2. VERIFY PIN & RESET PASSWORD
export const resetPasswordWithPin = async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "All fields are required." });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const db = openDb();

    try {
        // 1. Verify Code
        const validCode = db.prepare(`
            SELECT id FROM verification_codes 
            WHERE email = ? AND code = ? AND type = 'PASSWORD_RESET' 
            AND expiresAt > datetime('now')
            ORDER BY createdAt DESC LIMIT 1
        `).get(email, code);

        if (!validCode) {
            return res.status(400).json({ error: "Invalid or expired verification code." });
        }

        // 2. Hash New Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Update User Password
        const updateStmt = db.prepare('UPDATE users SET password = ? WHERE email = ?');
        updateStmt.run(hashedPassword, email);

        // 4. Cleanup: Delete used code
        db.prepare('DELETE FROM verification_codes WHERE id = ?').run(validCode.id);

        res.json({ success: true, message: "Password reset successfully. You can now login." });

    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};


export const deleteAccount = async (req, res) => {
    const { password } = req.body;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized." });
    }

    const db = openDb();

    try {
        // Fetch user including googleId
        const user = db.prepare('SELECT email, password, createdAt, googleId FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        // === LOGIC BRANCH ===
        // Case A: Google User (Has googleId) -> Skip password check
        // Case B: Regular User -> Require password check
        
        if (user.googleId) {
            // It's a Google user, allow deletion without password
            // (The session cookie proves their identity)
        } else {
            // It's a standard user, enforce password check
            if (!password) {
                return res.status(400).json({ error: "Password is required." });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: "Incorrect password." });
            }
        }

        // ... Rest of the archive and delete logic remains the same ...
        
        // 1. Archive
        const archiveStmt = db.prepare(`
            INSERT INTO deleted_users (email, originalUserId, userCreatedAt) 
            VALUES (?, ?, ?)
        `);
        archiveStmt.run(user.email, userId, user.createdAt);

        // 2. Delete
        const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
        deleteStmt.run(userId);

        // 3. Logout
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