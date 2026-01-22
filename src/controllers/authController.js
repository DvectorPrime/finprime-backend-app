import bcrypt from "bcryptjs"
import { openDb } from "../db/database.js"

export async function meController(req, res) {

    const db = openDb()

    const id = req.session.userId

    if (!id){
        return res.json({ isAuthenticated : false, name: null})
    }

    const firstNameStmt =  db.prepare('SELECT firstName FROM users WHERE id = ?')
    const data = firstNameStmt.get(id) || null

    if (!data){
        return res.status(500).json({error : "User Not Found."})
    }

    return res.json({ isAuthenticated : true, name : data.firstName})
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
    
        if (!data){
            return res.status(400).json({error : "USER not in database"})
        }
    
        const isPasswordValid = await bcrypt.compare(password, data.hash)
    
        if (!isPasswordValid){
            return res.status(400).json({error : "Incorrect Password"})
        }
    
        req.session.userId = data.id
    
        console.log(req.session.userId)
    
        res.json({message: "Login Succesful"})
    } catch (err) {
        return res.status(500).json({error: "An error occcured"})
    }

}

export async function register(req, res){
    const db = openDb()

    let { firstName, email, password } = req.body

    firstName = firstName.split(" ")[0] 
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    
    if (!emailRegex.test(email)){
        return res.status(400).json({error : "Invalid Email Address"})
    }
    
    const passwordHash = await bcrypt.hash(password, 10)
    
    const emailStmt = db.prepare('SELECT email FROM users WHERE email = ?')
    
    const emailExists = emailStmt.get(email)

    console.log(firstName, email, password)

    if (emailExists){
        return res.status(400).json({error : "User already exists"})
    }

    const createUserStatement = db.prepare('INSERT INTO users (email, firstName, password) VALUES (?, ?, ?)')

    const results = createUserStatement.run(email, firstName, passwordHash)

    const userId = results.lastInsertRowid

    req.session.userId = userId

    return res.json({success : "Email Created Successfully", firstName : firstName})
}

export async function googleAuth(req, res){
    console.log("rreaerawe")

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
            if(!user.googleId){
                const linkAccount = db.prepare('UPDATE users SET googleId = ?, avatar = ? WHERE email = ?')
                linkAccount.run(googleUser.id, googleUser.picture, googleUser.email)
            }
        } else {
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
    
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
        }

        req.session.userId = user.id
        res.json({success : "Authentication Successful"})
    } catch (err) {
        console.log({error : err.message})
        return res.status(500).json({ error: "Authentication Failed due to server Error. Try again later" })
    }
}

export async function logOutUser(req, res) {
    console.log("called")
    await req.session.destroy(() => {
        res.json({message: 'Logged out'})
    })
}