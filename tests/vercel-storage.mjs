import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
await mkdir("work", { recursive: true });
const output = path.resolve(`work/storage-test-${Date.now()}.mjs`);
await build({ entryPoints: ["lib/market/vercel-env.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external" });
process.env.TURSO_DATABASE_URL = ":memory:";
try {
  const { env } = await import(pathToFileURL(output).href);
  const db = env.DB;
  await db.prepare("CREATE TABLE sample (id TEXT PRIMARY KEY, value INTEGER)").run();
  const insert = db.prepare("INSERT INTO sample VALUES (?, ?)");
  assert.equal((await insert.bind("one", 1).run()).meta.changes, 1);
  assert.deepEqual(await db.prepare("SELECT * FROM sample WHERE id = ?").bind("one").first(), { id: "one", value: 1 });
  await assert.rejects(db.batch([insert.bind("two", 2), insert.bind("one", 9)]));
  assert.equal(await db.prepare("SELECT * FROM sample WHERE id = ?").bind("two").first(), null);
  assert.equal((await db.prepare("SELECT * FROM sample").all()).results.length, 1);
  assert.equal((await db.prepare("UPDATE sample SET value=3 WHERE id=?").bind("missing").run()).meta.changes, 0);
  console.log("6 Vercel storage checks passed, including atomic rollback");
} finally { await unlink(output); }
