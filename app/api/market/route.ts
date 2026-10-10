import { z } from "zod";
import {
  session,
  owner,
  db,
  snapshot,
  agents,
  newOrder,
  insertOrder,
  execute,
  getOrder,
  chain,
  config,
  event,
  refundDemo,
  syncFunding,
} from "@/lib/market/server";
import {
  buildOpen,
  buildRegister,
  buildAction,
  pda,
  walletTransaction,
  verifySignature,
  verifyOrder,
  agentExists,
} from "@/lib/market/chain";
import { canRefund, assertRating } from "@/lib/market/domain";
import { nonce } from "@/lib/market/crypto";
import type { Agent } from "@/lib/market/types";
const text = z.string().trim();
const uid = z.string().regex(/^[a-f0-9]{64}$/);
const wallet = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge"), wallet }),
  z.object({
    action: z.literal("login"),
    wallet,
    signature: z.string().max(150),
  }),
  z.object({ action: z.literal("logout") }),
  z.object({
    action: z.literal("create"),
    agentId: text.max(80),
    brief: text.min(10).max(4000),
    mode: z.enum(["demo", "devnet"]),
  }),
  z.object({ action: z.literal("execute"), id: z.string().uuid() }),
  z.object({ action: z.literal("pay"), id: z.string().uuid() }),
  z.object({ action: z.literal("sync"), id: z.string().uuid() }),
  z.object({ action: z.literal("refund"), id: z.string().uuid() }),
  z.object({
    action: z.literal("rate"),
    id: z.string().uuid(),
    score: z.number().int().min(1).max(5),
  }),
  z.object({
    action: z.literal("register"),
    uid,
    name: text.min(2).max(24),
    description: text.min(10).max(100),
    kind: z.enum(["author", "editor"]),
    price: z.number().int().min(1000000).max(1000000000),
    mode: z.enum(["demo", "devnet"]),
  }),
]);
export async function GET(request: Request) {
  try {
    const { s, cookie } = await session(request);
    return Response.json(await snapshot(s), {
      headers: {
        "Cache-Control": "no-store",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    });
  } catch (e) {
    console.error("market storage unavailable", e);
    return Response.json(
      { error: "Unable to load data. Please try again." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  let cookie: string | undefined;
  try {
    const requestUrl = new URL(request.url);
    const publicOrigin = new URL(requestUrl.protocol + "//" + (request.headers.get("host") || requestUrl.host)).origin;
    if (request.headers.get("origin") !== publicOrigin)
      throw new Error("Requests must originate from the marketplace");
    if (Number(request.headers.get("content-length") || 0) > 32000)
      throw new Error("Request is too large");
    const raw = await request.text();
    if (raw.length > 32000) throw new Error("Request is too large");
    const input = schema.parse(JSON.parse(raw));
    const ss = await session(request);
    const s = ss.s;
    cookie = ss.cookie;
    let data: unknown = { ok: true };
    switch (input.action) {
      case "challenge": {
        const message = `Agent Market wallet sign-in\nOrigin: ${publicOrigin}\nWallet: ${input.wallet}\nNonce: ${nonce()}\nExpires: ${new Date(Date.now() + 300000).toISOString()}\nThis signature authenticates your wallet. It does not authorize payments.`;
        await db()
          .prepare(
            "UPDATE sessions SET challenge=?,challenge_expires=? WHERE id=?",
          )
          .bind(message, Date.now() + 300000, s.id)
          .run();
        data = { message };
        break;
      }
      case "login": {
        if (
          !s.challenge ||
          !s.challenge_expires ||
          s.challenge_expires < Date.now() ||
          !s.challenge.includes(`Wallet: ${input.wallet}\n`) ||
          !s.challenge.includes(`Origin: ${publicOrigin}\n`) ||
          !(await verifySignature(input.wallet, s.challenge, input.signature))
        )
          throw new Error("Signature is invalid or expired. Please reconnect.");
        const r = await db()
          .prepare(
            "UPDATE sessions SET wallet=?,challenge=NULL,challenge_expires=NULL WHERE id=? AND challenge=?",
          )
          .bind(input.wallet, s.id, s.challenge)
          .run();
        if (!r.meta.changes)
          throw new Error("This signature has already been used");
        s.wallet = input.wallet;
        break;
      }
      case "logout":
        await db()
          .prepare(
            "UPDATE sessions SET wallet=NULL,challenge=NULL,challenge_expires=NULL WHERE id=?",
          )
          .bind(s.id)
          .run();
        break;
      case "create": {
        const count = await db()
          .prepare(
            "SELECT COUNT(*) n FROM orders WHERE buyer=? AND created_at>? AND parent_id IS NULL",
          )
          .bind(owner(s), Date.now() - 3600000)
          .first<{ n: number }>();
        if ((count?.n ?? 0) >= 20)
          throw new Error("Limit reached: 20 orders per hour");
        const a = (await agents()).find((a) => a.id === input.agentId);
        if (!a) throw new Error("Agent not found");
        if (input.mode === "devnet" && (!s.wallet || !config().devnetReady))
          throw new Error(
            "Connect your wallet after Devnet has been configured",
          );
        const o = await newOrder(owner(s), a, input.brief, input.mode);
        let tx: string | undefined;
        if (input.mode === "devnet") {
          const ix = await buildOpen(chain(), o, s.wallet!);
          o.chainAddress = ix.address;
          tx = await walletTransaction(chain(), ix.instruction, s.wallet!);
        } else
          event(
            o,
            "Order created",
            "Demo escrow funded. No real funds are used.",
          );
        await insertOrder(o);
        data = { order: o, transaction: tx };
        break;
      }
      case "pay": {
        const o = await getOrder(input.id, owner(s));
        if (
          !s.wallet ||
          o.mode !== "devnet" ||
          o.status !== "awaiting_payment" ||
          Date.now() >= o.deadline
        )
          throw new Error("Payment is unavailable for this order");
        const state = await verifyOrder(chain(), o);
        if (state) {
          await syncFunding(o);
          data = { order: o };
          break;
        }
        data = {
          order: o,
          transaction: await walletTransaction(
            chain(),
            (await buildOpen(chain(), o, s.wallet)).instruction,
            s.wallet,
          ),
        };
        break;
      }
      case "execute":
        data = { order: await execute(input.id, owner(s)) };
        break;
      case "sync": {
        const o = await getOrder(input.id, owner(s));
        await syncFunding(o);
        data = { order: await getOrder(input.id, owner(s)) };
        break;
      }
      case "refund": {
        const o = await getOrder(input.id, owner(s));
        if (!canRefund(o, Date.now()))
          throw new Error("Refunds become available after the deadline");
        if (o.mode === "demo") await refundDemo(o);
        else {
          if (!s.wallet) throw new Error("Connect your wallet");
          const state = await verifyOrder(chain(), o);
          if (state?.status !== 0)
            throw new Error("Escrow is already closed or has not been funded");
          data = {
            transaction: await walletTransaction(
              chain(),
              await buildAction(chain(), o, "refund"),
              s.wallet,
            ),
          };
        }
        break;
      }
      case "rate": {
        const o = await getOrder(input.id, owner(s));
        assertRating(o, input.score);
        if (o.mode === "devnet") {
          const state = await verifyOrder(chain(), o);
          if (!state || state.status !== 1)
            throw new Error("Delivery has not been confirmed yet");
          if (!state.rated) {
            data = {
              transaction: await walletTransaction(
                chain(),
                await buildAction(chain(), o, "rate", input.score),
                s.wallet!,
              ),
            };
            break;
          }
          if (state.rated !== input.score)
            throw new Error("A different rating is already recorded on-chain");
        }
        const r = await db()
          .prepare(
            "UPDATE orders SET rating=? WHERE id=? AND buyer=? AND rating IS NULL AND status='completed'",
          )
          .bind(input.score, o.id, owner(s))
          .run();
        if (!r.meta.changes)
          throw new Error("Your rating has already been saved");
        break;
      }
      case "register": {
        if (input.kind === "author" && input.price < 6000000)
          throw new Error(
            "Writer services start at 0.006 SOL to cover editorial review",
          );
        const count = await db()
          .prepare("SELECT COUNT(*) n FROM agents WHERE owner=?")
          .bind(owner(s))
          .first<{ n: number }>();
        if ((count?.n ?? 0) >= 10)
          throw new Error("Maximum of 10 agents per owner");
        const a: Agent = {
          id: input.uid,
          owner: input.mode === "devnet" ? s.wallet! : owner(s),
          name: input.name,
          description: input.description,
          kind: input.kind,
          price: input.price,
          builtin: false,
          completed: 0,
          rating: null,
          reviews: 0,
        };
        if (input.mode === "devnet") {
          if (!s.wallet) throw new Error("Connect your wallet");
          a.chainAddress = await pda(chain(), "agent", s.wallet, input.uid);
          if (
            !(await agentExists(
              chain(),
              a.chainAddress,
              s.wallet,
              input.uid,
              input.kind === "author" ? 0 : 1,
              input.price,
              input.name,
              input.description,
            ))
          ) {
            data = {
              transaction: await walletTransaction(
                chain(),
                await buildRegister(
                  chain(),
                  s.wallet,
                  input.uid,
                  input.name,
                  input.description,
                  input.kind === "author" ? 0 : 1,
                  input.price,
                ),
                s.wallet,
              ),
            };
            break;
          }
        }
        await db()
          .prepare(
            "INSERT INTO agents (id,owner,data) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(a.id, owner(s), JSON.stringify(a))
          .run();
        data = { agent: a };
        break;
      }
    }
    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    });
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? "Check your form fields. Briefs must be 10–4,000 characters."
        : e instanceof Error
          ? e.message
          : "Unable to complete this action";
    console.error("market request failed", message);
    return Response.json(
      { error: message },
      { status: 400, headers: cookie ? { "Set-Cookie": cookie } : {} },
    );
  }
}
