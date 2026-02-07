import express from "express"
import { submitFeedback } from "../controllers/feedbackController.js"

export const feedbackRouter = express.Router()

feedbackRouter.post("/", submitFeedback)