import test from "node:test";
import assert from "node:assert/strict";
import {
  feeFor,
  canRefund,
  canSettle,
  assertRating,
} from "../lib/market/domain";
import {
  pda,
  buildOpen,
  buildAction,
  verifySignature,
} from "../lib/market/chain";
import { getAddressDecoder, generateKeyPairSigner } from "@solana/kit";
import { toBase64, hash } from "../lib/market/crypto";
import { builtins, type Order } from "../lib/market/types";
test("commission uses integer lamports and conserves principal", () => {
  for (const n of [1, 39, 40, 5_000_000, 20_000_000, 1_000_000_000]) {
    assert.equal(feeFor(n) + (n - feeFor(n)), n);
    assert.equal(feeFor(n), Math.floor((n * 250) / 10000));
  }
  for (const n of [-1, 0, NaN, 1.5, 1e15]) assert.throws(() => feeFor(n));
});
test("deadline has no overlap between settlement and refund", () => {
  for (const now of [99, 100, 101]) {
    const o = { status: "ready" as const, deadline: 100, result: "done" };
    assert.equal(canSettle(o, now), now < 100);
    assert.equal(canRefund(o, now), now >= 100);
  }
});
test("terminal/unfunded states cannot refund", () => {
  for (const status of ["completed", "refunded", "awaiting_payment"] as const)
    assert.equal(canRefund({ status, deadline: 100 }, 101), false);
});
test("one rating per completed order, bounded score", () => {
  assert.doesNotThrow(() => assertRating({ status: "completed" }, 5));
  for (const score of [0, 6, 1.5])
    assert.throws(() => assertRating({ status: "completed" }, score));
  assert.throws(() => assertRating({ status: "funded" }, 5));
  assert.throws(() => assertRating({ status: "completed", rating: 4 }, 5));
});
test("wallet auth binds exact message and key", async () => {
  const a = await generateKeyPairSigner(),
    b = await generateKeyPairSigner();
  const msg = "Origin: http://localhost\nNonce: one";
  const sig = toBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        a.keyPair.privateKey,
        new TextEncoder().encode(msg),
      ),
    ),
  );
  assert.equal(await verifySignature(a.address, msg, sig), true);
  assert.equal(await verifySignature(b.address, msg, sig), false);
  assert.equal(await verifySignature(a.address, msg + "changed", sig), false);
});
test("order PDAs are unique by buyer and nonce", async () => {
  const c = {
    programId: "Fg6PaFpoGXkYsidMpWxTWqkZ7FEfcYkgMQhgDfNQ6HjZ",
    rpcUrl: "https://api.devnet.solana.com",
    executor: (await generateKeyPairSigner()).address,
    treasury: (await generateKeyPairSigner()).address,
  };
  const a = (await generateKeyPairSigner()).address,
    b = (await generateKeyPairSigner()).address;
  assert.notEqual(
    await pda(c, "order", a, "01".repeat(32)),
    await pda(c, "order", b, "01".repeat(32)),
  );
  assert.notEqual(
    await pda(c, "order", a, "01".repeat(32)),
    await pda(c, "order", a, "02".repeat(32)),
  );
});
test("SDK instruction data matches Anchor field order and byte widths", async () => {
  const executor = (await generateKeyPairSigner()).address,
    treasury = (await generateKeyPairSigner()).address,
    buyer = (await generateKeyPairSigner()).address,
    agent = (await generateKeyPairSigner()).address;
  const c = {
    programId: "Fg6PaFpoGXkYsidMpWxTWqkZ7FEfcYkgMQhgDfNQ6HjZ",
    rpcUrl: "https://api.devnet.solana.com",
    executor,
    treasury,
  };
  const o = {
    id: "test",
    mode: "demo",
    brief: "brief",
    status: "ready",
    createdAt: 0,
    amount: 20_000_000,
    fee: 500_000,
    draft: "",
    events: [],
    attempts: 0,
    buyer: "wallet:" + buyer,
    agent: { ...builtins[0], chainAddress: agent, owner: executor },
    nonce: "ab".repeat(32),
    briefHash: await hash("brief"),
    deadline: 2_000_000_000_000,
    result: "Result",
    chainAddress: await pda(c, "order", buyer, "ab".repeat(32)),
  } as Order;
  const { instruction } = await buildOpen(c, o, buyer);
  assert.equal(instruction.data!.length, 112);
  assert.equal(instruction.accounts![0].address, buyer);
  assert.equal(
    Number(
      new DataView(Uint8Array.from(instruction.data!).buffer).getBigUint64(
        72,
        true,
      ),
    ),
    2_000_000_000,
  );
  const settle = await buildAction(c, o, "settle");
  assert.equal(settle.data!.length, 40);
  assert.equal(settle.accounts![0].address, executor);
  assert.equal(settle.accounts![3].address, executor);
  const refund = await buildAction(c, o, "refund");
  assert.equal(refund.accounts![0].address, buyer);
  const rate = await buildAction(c, o, "rate", 4);
  assert.equal(rate.data![8], 4);
});
