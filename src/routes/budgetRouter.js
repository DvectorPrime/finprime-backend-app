import express from "express";
import { getBudgetOverview, updateBudget } from "../controllers/budgetsController.js";

export const budgetRouter = express.Router()

budgetRouter.get("/", getBudgetOverview)
budgetRouter.put("/", updateBudget)