import bcrypt from "bcryptjs"
import { openDb } from "../db/database.js"

export async function meController(req, res) {

    const db = openDb()

    const id = req.session.userId

    if (!id){
        return res.json({ isAuthenticated : false, user: null})
    }

    // UPDATED: Left Join to get User details + Settings
    const stmt = db.prepare(`
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
    `)
    
    const data = stmt.get(id) || null

    if (!data){
        // If session exists but user is deleted from DB
        return res.status(401).json({ isAuthenticated: false, error : "User Not Found."})
    }

    // Map database columns to the frontend structure you requested
    // SQLite stores booleans as 1/0, so we convert them here
    return res.json({ 
        isAuthenticated : true, 
        user: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            avatarUrl: data.avatar || "", 
            themePreference: data.themePreference || "System",
            currencyPreference: data.currency || "NGN",
            aiInsights: data.aiInsights === 1, // Convert 1 -> true
            budgetAlerts: data.budgetAlerts === 1
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
    const db = openDb()

    let { firstName, email, password } = req.body

    // Basic validation
    if (!firstName || !email || !password) {
        return res.status(400).json({error: "All fields are required"})
    }

    firstName = firstName.split(" ")[0] 
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    
    if (!emailRegex.test(email)){
        return res.status(400).json({error : "Invalid Email Address"})
    }
    
    const passwordHash = await bcrypt.hash(password, 10)
    
    const emailStmt = db.prepare('SELECT email FROM users WHERE email = ?')
    const emailExists = emailStmt.get(email)

    if (emailExists){
        return res.status(400).json({error : "User already exists"})
    }

    // 1. Create User
    const createUserStatement = db.prepare('INSERT INTO users (email, firstName, password, avatar) VALUES (?, ?, ?, ?)')
    // Added empty string for avatar default
    const results = createUserStatement.run(email, firstName, passwordHash, "")

    const userId = results.lastInsertRowid

    // 2. UPDATED: Create Default Settings for this new user
    // The database defaults (System, NGN, 1, 0) will handle the values
    const createSettingsStmt = db.prepare('INSERT INTO settings (userId) VALUES (?)')
    createSettingsStmt.run(userId)

    req.session.userId = userId

    return res.json({success : "Account Created Successfully", firstName : firstName})
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