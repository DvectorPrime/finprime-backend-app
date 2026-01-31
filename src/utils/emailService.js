import dotenv from 'dotenv';
dotenv.config(); // Ensure env vars are loaded!

export async function sendEmail(email, firstName, code, type) {
  const apiKey = process.env.BREVO_API_KEY;
  const url = "https://api.brevo.com/v3/smtp/email";

  // 1. Debugging: Check if key is actually loaded
  if (!apiKey) {
    console.error("❌ FATAL: BREVO_API_KEY is missing from process.env");
    return false;
  }

  let subject = "";
  let message = "";

  if (type === "REGISTRATION") {
    subject = "Verify your email - FinPrime";
    message = `Welcome to FinPrime! Use this code to complete your registration:`;
  } else if (type === "PASSWORD_RESET") {
    subject = "Reset Password - FinPrime";
    message = `Use this code to reset your password:`;
  }

  const htmlBody = `
    <html>
    <body style="font-family: sans-serif;">
    <h2>${subject}</h2>
    <p>Hi ${firstName},</p>
    <p>${message}</p>
    <h1 style="background: #f3f4f6; padding: 10px; display: inline-block; letter-spacing: 5px;">${code}</h1>
    <p>This code expires in 15 minutes.</p>
    </body>
    </html>
    `;

  const emailData = {
    // IMPORTANT: This email MUST be verified in your Brevo Dashboard
    sender: { email: "nwachukwuvictor2008@gmail.com", name: "FinPrime" }, 
    to: [{ email: email }],
    subject: subject,
    htmlContent: htmlBody,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "accept": "application/json"
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
        // FIX: Await the JSON to see the real error message
        const errorData = await response.json(); 
        console.error(`❌ Brevo API Error: ${response.status} ${response.statusText}`, errorData);
        return false;
    }

    console.log(`✅ Email sent successfully to ${email}`);
    return true;

  } catch (error) {
    console.error("❌ Network/Fetch Error:", error);
    return false;
  }
}