import express from "express"
import { getAllTransactions, getDashboardStats } from "../controllers/transactionsController.js"

export const transactionsRouter = express.Router()

transactionsRouter.get('/', getAllTransactions)
transactionsRouter.get('/dashboardStats', getDashboardStats)