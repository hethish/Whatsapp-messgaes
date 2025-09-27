```js
import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";   // ✅ FIXED for CommonJS
const { Client, LocalAuth, MessageMedia } = pkg;

// ================== CONFIG ==================
const PORT = process.env.PORT || 3000;
const SHEET_ID = process.env.SHEET_ID;   // Google Sheet ID
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS; // Service account JSON
// ============================================

// Express server (keeps app alive on Render)
const app = express();
app.use(bodyParser.json());
app.get("/", (req, res) => res.send("✅ WhatsApp + Google Sheets Bot is running!"));

// ================== GOOGLE SHEETS ==================
let sheetsClient;

async function authorizeSheets() {
  if (!GOOGLE_CREDENTIALS) {
    throw new Error("❌ GOOGLE_CREDENTIALS not found in environment variables.");
  }

  const credentials = JSON.parse(GOOGLE_CREDENTIALS);

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  sheetsClient = google.sheets({ version: "v4", auth });
  console.log("📊 Google Sheets API initialized");
}

async function readSheetData() {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A2:E", // Columns: Name | Number | Message | ImageURL | Status
  });
  return res.data.values || [];
}

async function updateStatus(row, status) {
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Sheet1!E${row + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  });
}

// ================== WHATSAPP BOT ==================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("📱 Scan this QR code with your WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  console.log("🤖 WhatsApp Bot is ready!");

  try {
    await authorizeSheets();
    console.log("✅ Connected to Google Sheets");
  } catch (err) {
    console.error("❌ Google Sheets setup failed:", err.message);
  }

  setInterval(async () => {
    const rows = await readSheetData();
    for (let i = 0; i < rows.length; i++) {
      const [name, number, message, imageUrl, status] = rows[i];
      if (status && status.toLowerCase() === "sent") continue;

      const chatId = number.includes("@c.us") ? number : `${number}@c.us`;

      try {
        if (imageUrl) {
          const media = await MessageMedia.fromUrl(imageUrl);
          await client.sendMessage(chatId, media, { caption: message });
        } else {
          await client.sendMessage(chatId, message);
        }

        console.log(`✅ Sent to ${number}: ${message}`);
        await updateStatus(i, "Sent");
        await new Promise((r) => setTimeout(r, 5000)); // Delay 5s between messages
      } catch (err) {
        console.error(`❌ Failed to send to ${number}:`, err.message);
        await updateStatus(i, "Failed");
      }
    }
  }, 30000); // Check every 30s
});

client.initialize();

// ================== START EXPRESS ==================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```
