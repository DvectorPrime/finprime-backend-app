import express from 'express';
import multer from 'multer';
import { uploadAvatar } from '../controllers/uploadController.js';

export const uploadRouter = express.Router();

// Configure Multer to store file in memory (RAM) temporarily
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, 
});

// The route expects a field named 'avatar'
uploadRouter.post('/upload-avatar', upload.single('avatar'), uploadAvatar);