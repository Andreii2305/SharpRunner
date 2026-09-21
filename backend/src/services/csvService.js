const formulaPrefixPattern = /^[\s\u0000-\u001f]*[=+\-@]/;

const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = formulaPrefixPattern.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const serializeCsv = ({ headers, rows }) => {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return `\uFEFF${csv}`;
};

const safeCsvFilename = (filename) => {
  const normalized = String(filename || "export.csv")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.toLowerCase().endsWith(".csv") ? normalized : `${normalized || "export"}.csv`;
};

const sendCsv = (res, filename, headers, rows) => {
  const safeFilename = safeCsvFilename(filename);
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safeFilename}"`,
    "X-Content-Type-Options": "nosniff",
  });
  return res.send(serializeCsv({ headers, rows }));
};

module.exports = { csvCell, safeCsvFilename, sendCsv, serializeCsv };

