const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const supabaseConfig = () => {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const bucket = process.env.SUPABASE_LESSON_BUCKET || "lesson-files";
  return process.env.LESSON_FILE_STORAGE === "supabase" && url && key ? { url, key, bucket } : null;
};

const uploadFile = async (file, scope = "lessons") => {
  const data = await fs.promises.readFile(file.path);
  const config = supabaseConfig();
  if (!config) return { data, storageProvider: "database", storageKey: null };
  const extension = path.extname(file.originalname).slice(0, 20).toLowerCase();
  const storageKey = `${scope}/${crypto.randomUUID()}${extension}`;
  const response = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${storageKey}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, apikey: config.key, "Content-Type": file.mimetype || "application/octet-stream", "x-upsert": "false" },
    body: data,
  });
  if (!response.ok) throw new Error(`Supabase upload failed (${response.status})`);
  return { data: null, storageProvider: "supabase", storageKey };
};

const readFile = async (record) => {
  if (record.data) return Buffer.from(record.data);
  if (record.storageProvider !== "supabase" || !record.storageKey) return null;
  const config = supabaseConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${record.storageKey}`, { headers: { Authorization: `Bearer ${config.key}`, apikey: config.key } });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
};

const deleteFile = async (record) => {
  if (record.storageProvider !== "supabase" || !record.storageKey) return;
  const config = supabaseConfig();
  if (!config) return;
  await fetch(`${config.url}/storage/v1/object/${config.bucket}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${config.key}`, apikey: config.key, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [record.storageKey] }),
  });
};

module.exports = { uploadFile, readFile, deleteFile, storageMode: () => supabaseConfig() ? "supabase" : "database" };
