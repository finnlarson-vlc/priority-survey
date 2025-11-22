const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the frontend (adjust path if needed)
app.use(express.static(path.join(__dirname)));

const RESULTS_FILE = path.join(__dirname, "survey-results.csv");
const MAX_PER_BUCKET = 5;

function ensureCsvHeader() {
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
  // escape double-quotes by doubling them
  return `"${str.replace(/"/g, '""')}"`;
}

app.post("/api/save-survey", (req, res) => {
  const { email, high, medium, low } = req.body || {};

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

  ensureCsvHeader();

  const timestamp = new Date().toISOString();
  const rowFields = [
    timestamp,
    email,
    ...high,
    ...medium,
    ...low
  ].map(csvEscape);

  fs.appendFile(RESULTS_FILE, rowFields.join(",") + "\n", "utf8", (err) => {
    if (err) {
      console.error("Error writing CSV:", err);
      return res.status(500).json({ error: "Failed to save" });
    }
    res.json({ status: "ok" });
  });
});

app.listen(PORT, () => {
  console.log(`Survey server running on http://localhost:${PORT}`);
});
