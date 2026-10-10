import { createClient, type Client, type InValue, type ResultSet } from "@libsql/client";

let client: Client | undefined;
function connection() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is required for persistent storage");
  if (process.env.VERCEL && !/^(libsql|https):\/\//.test(url))
    throw new Error("Vercel requires a remote persistent database");
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}
function result(r: ResultSet) {
  return { results: r.rows, success: true, meta: { changes: r.rowsAffected } };
}
class Statement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: InValue[]) { return new Statement(this.sql, args); }
  async first<T>() {
    const r = await connection().execute({ sql: this.sql, args: this.args });
    return (r.rows[0] as T | undefined) ?? null;
  }
  async all<T>() {
    const r = result(await connection().execute({ sql: this.sql, args: this.args }));
    return { ...r, results: r.results as T[] };
  }
  async run() { return result(await connection().execute({ sql: this.sql, args: this.args })); }
}
const database = {
  prepare(sql: string) { return new Statement(sql); },
  async batch(statements: Statement[]) {
    // A failed statement rolls back the whole batch, matching D1 semantics.
    const results = await connection().batch(
      statements.map(({ sql, args }) => ({ sql, args })), "write",
    );
    return results.map(result);
  },
};
// This adapter implements the D1 methods used by the marketplace server.
export const env = new Proxy({} as Record<string, unknown>, {
  get: (_target, key) => key === "DB" ? database : process.env[String(key)],
});
