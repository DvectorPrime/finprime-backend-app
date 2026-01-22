import express from "express"
import { login, meController, register, googleAuth, logOutUser } from "../controllers/authController.js"

export const authRouter = express.Router()

authRouter.post("/register", register)
authRouter.post("/login", login)
authRouter.get("/me", meController)
authRouter.post("/google", googleAuth)
authRouter.get("/logout", logOutUser)