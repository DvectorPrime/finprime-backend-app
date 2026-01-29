import { v2 as cloudinary } from "cloudinary";
import { openDb } from "../db/database.js"; // Adjust path to your DB file
// import streamifier from 'streamifier'; // Optional: helps turn buffer to stream, or use built-in logic below

export const uploadAvatar = async (req, res) => {
  // 1. Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Check if a file was actually sent
  if (!req.file) {
    return res.status(400).json({ error: "No image file provided" });
  }

  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 2. Define the Upload Logic (Stream Buffer -> Cloudinary)
    const streamUpload = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "finprime", // Your specific folder
            resource_type: "image",
            display_name: `${userId} avatar`,
            public_id: `${userId}_avatar`,
            invalidate: true,
            overwrite: true,
            transformation: [{ width: 400, height: 400, crop: "fill" }], // Optimization
          },
          (error, result) => {
            if (result) {
              resolve(result);
            } else {
              reject(error);
            }
          },
        );
        // Pipe the file buffer into the upload stream
        stream.end(fileBuffer);
      });
    };

    // 3. Execute Upload
    const result = await streamUpload(req.file.buffer);
    console.log(result);
    const avatarUrl = result.secure_url;

    // 4. Update Database
    const db = openDb();
    const updateStmt = db.prepare("UPDATE users SET avatar = ? WHERE id = ?");
    updateStmt.run(avatarUrl, userId);

    console.log(`Avatar updated for user ${userId}: ${avatarUrl}`);

    // 5. Send back the new URL
    res.json({ success: true, avatarUrl });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({ error: "Image upload failed" });
  }
};
