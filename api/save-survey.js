const { google } = require("googleapis");

const MAX_PER_BUCKET = 5;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      if (!data) {
        return resolve({});
      }
      try {
        const json = JSON.parse(data);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}

async function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error("Google service account env vars are missing");
  }

  // Handle escaped newlines in env var
  const privateKey = key.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT(
    email,
    null,
    privateKey,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  await auth.authorize();

  return google.sheets({ version: "v4", auth });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    console.error("Invalid JSON body:", err);
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { email, high, medium, low } = body || {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  const isArrayOfLength = (arr) =>
    Array.isArray(arr) && arr.length === MAX_PER_BUCKET;

  if (!isArrayOfLength(high) || !isArrayOfLength(medium) || !isArrayOfLength(low)) {
    return res
      .status(400)
      .json({ error: `Each bucket must contain exactly ${MAX_PER_BUCKET} items` });
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!spreadsheetId) {
      throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set");
    }

    const timestamp = new Date().toISOString();
    const row = [
      timestamp,
      email,
      ...high,
      ...medium,
      ...low
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      // If your tab is not named "Sheet1", change it here (e.g. "Data!A:Z")
      range: "Sheet1!A:Z",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row]
      }
    });

    console.log("Added row to Google Sheet:", row);

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Error writing to Google Sheets:", err);
    return res.status(500).json({ error: "Failed to save" });
  }
};
