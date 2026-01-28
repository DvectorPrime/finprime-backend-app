import express from "express"
import { getAllTransactions, getDashboardStats, createTransaction, getMonthlyStats } from "../controllers/transactionsController.js"

export const transactionsRouter = express.Router()

transactionsRouter.get('/', getAllTransactions)
transactionsRouter.post('/', createTransaction)
transactionsRouter.get('/dashboardStats', getDashboardStats)
transactionsRouter.get('/monthly-stats', getMonthlyStats);