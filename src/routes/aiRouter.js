import express from "express"
import { getInsight } from "../controllers/aiController.js"

export const aiRouter = express.Router()

aiRouter.post('/', getInsight)