import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  wallet: text("wallet"),
  challenge: text("challenge"),
  challengeExpires: integer("challenge_expires"),
  expires: integer("expires").notNull(),
});
export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    data: text("data").notNull(),
  },
  (t) => [index("agents_owner_idx").on(t.owner)],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    buyer: text("buyer").notNull(),
    agentId: text("agent_id").notNull(),
    parentId: text("parent_id"),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
    rating: integer("rating"),
    leaseUntil: integer("lease_until").notNull().default(0),
    leaseToken: text("lease_token"),
    data: text("data").notNull(),
  },
  (t) => [
    index("orders_buyer_created_idx").on(t.buyer, t.createdAt),
    index("orders_agent_status_idx").on(t.agentId, t.status),
  ],
);
