const fs = require("fs");
const path = require("path");

const MAX_PER_BUCKET = 5;

// On Vercel, only /tmp is writable inside a serverless function
const RESULTS_DIR = "/tmp";
const RESULTS_FILE = path.join(RESULTS_DIR, "survey-results.csv");

function ensureCsvHeader() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  if (fs.existsSync(RESULTS_FILE)) return;

  const headers = [
    "timestamp_iso",
    "email",
    ...Array.from({ length: MAX_PER_BUCKET }, (_, i) => `high_${i + 1}`),
    ...Array.from({ length: MAX_PER_BUCKET }, (_, i) => `medium_${i + 1}`),
    ...Array.from({ length: MAX_PER_BUCKET }, (_, i) => `low_${i + 1}`)
  ];
  fs.writeFileSync(RESULTS_FILE, headers.join(",") + "\n", "utf8");
}

function csvEscape(value) {
  if (value == null) return "";
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

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
    ensureCsvHeader();

    const timestamp = new Date().toISOString();
    const rowFields = [
      timestamp,
      email,
      ...high,
      ...medium,
      ...low
    ].map(csvEscape);

    // Write to /tmp CSV
    fs.appendFileSync(RESULTS_FILE, rowFields.join(",") + "\n", "utf8");

    // Also log the row so you can see it in Vercel logs
    console.log("SURVEY_ROW", rowFields.join(","));

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Error writing CSV:", err);
    return res.status(500).json({ error: "Failed to save" });
  }
};
