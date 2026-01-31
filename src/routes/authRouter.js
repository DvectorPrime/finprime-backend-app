import express from "express"
import { login, meController, register, googleAuth, logOutUser, changePassword, deleteAccount, sendRegistrationCode, resetPasswordWithPin, forgotPassword } from "../controllers/authController.js"

export const authRouter = express.Router()

authRouter.post("/register", register)
authRouter.post("/login", login)
authRouter.post("/send-code", sendRegistrationCode)
authRouter.get("/me", meController)
authRouter.post("/google", googleAuth)
authRouter.get("/logout", logOutUser)
authRouter.put("/change-password", changePassword)
authRouter.post('/forgot-password', forgotPassword);      // <--- Add this
authRouter.post('/reset-password', resetPasswordWithPin); // <--- Add this
authRouter.delete("/delete-account", deleteAccount)