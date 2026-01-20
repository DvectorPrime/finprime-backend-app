import bcrypt from "bcryptjs"
import { openDb } from "../db/database.js"

export async function meController(req, res) {

    const db = openDb()

    const id = req.session.userId

    if (!id){
        return res.json({ isAuthenticated : false, name: null})
    }

    const firstNameStmt =  db.prepare('SELECT firstName FROM users WHERE id = ?')
    const {firstName} = firstNameStmt.get(id)

    if (!firstName){
        return res.status(500).json({error : "User Not Found."})
    }

    console.log(firstName)
    return res.json({ isAuthenticated : true, name : firstName})
}

export async function login(req, res) {
    const db = openDb()

    const { email, password } = req.body

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    
    if (!emailRegex.test(email)){
        return res.status(400).json({error : "Invalid Email Address"})
    }

    const idStmt = db.prepare('SELECT id, password AS hash FROM users WHERE email = ?')

    const {id, hash} = idStmt.get(email)

    if (!id){
        return res.status(400).json({error : "USER not in database"})
    }

    const isPasswordValid = await bcrypt.compare(password, hash)

    if (!isPasswordValid){
        return res.status(400).json({error : "Incorrect Password"})
    }

    req.session.userId = id

    console.log(req.session.userId)

    res.json({message: "Login Succesful"})
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