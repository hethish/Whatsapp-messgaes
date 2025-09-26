// index.js
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { google } from "googleapis";
import fetch from "node-fetch";

// ------------------- CONFIG -------------------

// Google Sheet ID
const SHEET_ID = "1vmbeKbOd6u_RBuXSdUdGoyzH1eTANRsOvMN6q4g4TDY";
const RANGE = "Sheet1!A2:E"; // Adjust if needed

// Delay between messages (ms)
const MESSAGE_DELAY = 3000;

// ------------------- GOOGLE SHEETS SETUP -------------------
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ------------------- WHATSAPP CLIENT -------------------
const client = new Client({
  authStrategy: new LocalAuth(), // saves session to avoid scanning QR every time
  puppeteer: { headless: true },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("Scan the QR code above to log in to WhatsApp Web.");
});

client.on("ready", async () => {
  console.log("✅ WhatsApp client is ready!");

  try {
    // Fetch rows from Google Sheets
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: RANGE,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      console.log("No data found in the sheet.");
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const [name, number, message, imageUrl, status] = rows[i];

      if (status === "Sent") continue; // skip already sent

      try {
        if (imageUrl) {
          // Send image with caption
          const media = await MessageMedia.fromUrl(imageUrl);
          await client.sendMessage(number + "@c.us", media, { caption: message });
        } else {
          // Send text only
          await client.sendMessage(number + "@c.us", message);
        }

        console.log(`✅ Sent to ${number}`);

        // Update status in Google Sheets
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Sheet1!E${i + 2}`,
          valueInputOption: "RAW",
          requestBody: { values: [["Sent"]] },
        });
      } catch (err) {
        console.error(`❌ Failed for ${number}:`, err.message);

        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Sheet1!E${i + 2}`,
          valueInputOption: "RAW",
          requestBody: { values: [["Failed"]] },
        });
      }

      // Wait before next message
      await new Promise((resolve) => setTimeout(resolve, MESSAGE_DELAY));
    }
  } catch (err) {
    console.error("Error reading Google Sheet:", err.message);
  }
});

client.initialize();
