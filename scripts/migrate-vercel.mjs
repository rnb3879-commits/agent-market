import { createClient } from "@libsql/client";
import { readFile, readdir } from "node:fs/promises";

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error("Set TURSO_DATABASE_URL before applying migrations");
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  await db.execute("CREATE TABLE IF NOT EXISTS market_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set((await db.execute("SELECT name FROM market_migrations")).rows.map(r => r.name));
  for (const name of (await readdir(new URL("../drizzle/", import.meta.url))).filter(n => n.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    const source = await readFile(new URL("../drizzle/" + name, import.meta.url), "utf8");
    const statements = source.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
    await db.batch([...statements, { sql: "INSERT INTO market_migrations (name, applied_at) VALUES (?, ?)", args: [name, Date.now()] }], "write");
    console.log(`Applied ${name}`);
  }
  console.log("Database migrations complete");
} finally { db.close(); }
