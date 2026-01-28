import express from "express"
import { updateSettings, getSettings } from "../controllers/settingsController.js"

export const settingsRouter = express.Router()

settingsRouter.get('/', getSettings)
settingsRouter.put('/', updateSettings)