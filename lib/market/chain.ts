import {
  address,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  AccountRole,
  createSolanaRpc,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getTransactionEncoder,
  pipe,
  signTransaction,
  createKeyPairSignerFromBytes,
  getBase64EncodedWireTransaction,
  type Instruction,
  type Address,
  signature,
} from "@solana/kit";
import { hash, unhex, toBase64, fromBase64 } from "./crypto";
import type { Order } from "./types";
export type ChainSettings = {
  programId: string;
  rpcUrl: string;
  executor: string;
  treasury: string;
  executorSecret?: string;
};
const SYSTEM = address("11111111111111111111111111111111");
const enc = new TextEncoder();
const key = (s: string) =>
  new Uint8Array(getAddressEncoder().encode(address(s)));
const cat = (...parts: Readonly<Uint8Array>[]) => {
  const b = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    b.set(p, o);
    o += p.length;
  }
  return b;
};
const u64 = (n: number | bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
};
const str = (s: string) => {
  const bytes = enc.encode(s),
    l = new Uint8Array(4);
  new DataView(l.buffer).setUint32(0, bytes.length, true);
  return cat(l, bytes);
};
const disc = async (s: string) => unhex(await hash(s)).slice(0, 8);
const meta = (a: string, r: AccountRole) => ({ address: address(a), role: r });
export async function pda(
  c: ChainSettings,
  type: "config" | "agent" | "order",
  owner?: string,
  nonce?: string,
) {
  const seeds: Readonly<Uint8Array>[] = [enc.encode(type)];
  if (owner) seeds.push(key(owner));
  if (nonce) seeds.push(unhex(nonce));
  return (
    await getProgramDerivedAddress({
      programAddress: address(c.programId),
      seeds,
    })
  )[0];
}
export async function buildOpen(c: ChainSettings, o: Order, buyer: string) {
  if (!o.agent.chainAddress)
    throw new Error("This agent is not registered on Devnet yet");
  const order = await pda(c, "order", buyer, o.nonce);
  const data = cat(
    await disc("global:open_order"),
    unhex(o.nonce),
    unhex(o.briefHash),
    u64(Math.floor(o.deadline / 1000)),
    o.parentAddress ? key(o.parentAddress) : new Uint8Array(32),
  );
  const accounts = [
    meta(buyer, AccountRole.WRITABLE_SIGNER),
    meta(await pda(c, "config"), AccountRole.READONLY),
    meta(o.agent.chainAddress, AccountRole.READONLY),
    meta(order, AccountRole.WRITABLE),
    meta(SYSTEM, AccountRole.READONLY),
  ];
  return {
    instruction: {
      programAddress: address(c.programId),
      accounts,
      data,
    } satisfies Instruction,
    address: order,
  };
}
export async function buildRegister(
  c: ChainSettings,
  owner: string,
  uid: string,
  name: string,
  description: string,
  kind: number,
  price: number,
) {
  return {
    programAddress: address(c.programId),
    accounts: [
      meta(owner, AccountRole.WRITABLE_SIGNER),
      meta(await pda(c, "agent", owner, uid), AccountRole.WRITABLE),
      meta(SYSTEM, AccountRole.READONLY),
    ],
    data: cat(
      await disc("global:register_agent"),
      unhex(uid),
      Uint8Array.of(kind),
      u64(price),
      str(name),
      str(description),
    ),
  } satisfies Instruction;
}
export async function buildInitialize(c: ChainSettings, authority: string) {
  const loader = address("BPFLoaderUpgradeab1e11111111111111111111111");
  const [programData] = await getProgramDerivedAddress({
    programAddress: loader,
    seeds: [key(c.programId)],
  });
  return {
    programAddress: address(c.programId),
    accounts: [
      meta(authority, AccountRole.WRITABLE_SIGNER),
      meta(await pda(c, "config"), AccountRole.WRITABLE),
      meta(c.programId, AccountRole.READONLY),
      meta(programData, AccountRole.READONLY),
      meta(SYSTEM, AccountRole.READONLY),
    ],
    data: cat(
      await disc("global:initialize"),
      key(c.executor),
      key(c.treasury),
    ),
  } satisfies Instruction;
}
export async function buildAction(
  c: ChainSettings,
  o: Order,
  action: "settle" | "refund" | "rate",
  score = 0,
) {
  if (!o.chainAddress || !o.agent.chainAddress)
    throw new Error("Escrow account not found");
  const signer =
    action === "settle" ? c.executor : o.buyer.replace("wallet:", "");
  let accounts = [
    meta(signer, AccountRole.WRITABLE_SIGNER),
    meta(o.chainAddress, AccountRole.WRITABLE),
  ];
  if (action === "settle")
    accounts.push(
      meta(o.agent.chainAddress, AccountRole.WRITABLE),
      meta(o.agent.owner, AccountRole.WRITABLE),
      meta(c.treasury, AccountRole.WRITABLE),
    );
  if (action === "rate")
    accounts.push(meta(o.agent.chainAddress, AccountRole.WRITABLE));
  const data = cat(
    await disc("global:" + action),
    action === "settle"
      ? unhex(await hash(o.result))
      : action === "rate"
        ? Uint8Array.of(score)
        : new Uint8Array(),
  );
  return {
    programAddress: address(c.programId),
    accounts,
    data,
  } satisfies Instruction;
}
export async function transaction(
  c: ChainSettings,
  ix: Instruction,
  payer: string,
) {
  const rpc = createSolanaRpc(c.rpcUrl);
  const { value: lifetime } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(payer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstruction(ix, m),
  );
  return compileTransaction(message);
}
export async function walletTransaction(
  c: ChainSettings,
  ix: Instruction,
  payer: string,
) {
  return toBase64(
    new Uint8Array(
      getTransactionEncoder().encode(await transaction(c, ix, payer)),
    ),
  );
}
export async function sendExecutor(c: ChainSettings, ix: Instruction) {
  if (!c.executorSecret) throw new Error("Executor key is not configured");
  const bytes = Uint8Array.from(JSON.parse(c.executorSecret));
  const signer = await createKeyPairSignerFromBytes(bytes);
  if (signer.address !== c.executor)
    throw new Error("Executor address does not match its key");
  const tx = await signTransaction(
    [signer.keyPair],
    await transaction(c, ix, c.executor),
  );
  const rpc = createSolanaRpc(c.rpcUrl);
  const sig = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(tx), {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })
    .send();
  for (let i = 0; i < 20; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    if (value[0]?.err) throw new Error("The network rejected this transaction");
    if (["confirmed", "finalized"].includes(value[0]?.confirmationStatus ?? ""))
      return sig;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Confirmation is still pending. Try syncing again.");
}
export async function readOrder(c: ChainSettings, a: string) {
  const { value } = await createSolanaRpc(c.rpcUrl)
    .getAccountInfo(address(a), { encoding: "base64", commitment: "confirmed" })
    .send();
  if (!value) return null;
  if (value.owner !== c.programId) throw new Error("Invalid escrow owner");
  const orderDiscriminator = await disc("account:Order");
  const b = fromBase64(value.data[0]);
  if (
    b.length < 323 ||
    !b.slice(0, 8).every((v, i) => v === orderDiscriminator[i])
  )
    throw new Error("Invalid escrow account");
  const d = new DataView(b.buffer),
    addr = (o: number) => getAddressDecoder().decode(b.slice(o, o + 32));
  return {
    buyer: addr(8),
    agent: addr(40),
    seller: addr(72),
    executor: addr(104),
    treasury: addr(136),
    amount: Number(d.getBigUint64(168, true)),
    fee: Number(d.getBigUint64(176, true)),
    deadline: Number(d.getBigInt64(184, true)) * 1000,
    briefHash: Array.from(b.slice(224, 256), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join(""),
    resultHash: Array.from(b.slice(256, 288), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join(""),
    status: b[288],
    rated: b[289],
  };
}
export async function verifyOrder(c: ChainSettings, o: Order) {
  if (!o.chainAddress) throw new Error("Order address is missing");
  const state = await readOrder(c, o.chainAddress);
  if (!state) return null;
  if (
    state.buyer !== o.buyer.replace("wallet:", "") ||
    state.agent !== o.agent.chainAddress ||
    state.seller !== o.agent.owner ||
    state.executor !== c.executor ||
    state.treasury !== c.treasury ||
    state.amount !== o.amount ||
    state.fee !== o.fee ||
    state.briefHash !== o.briefHash ||
    state.deadline !== o.deadline
  )
    throw new Error("Escrow terms do not match the order");
  if (
    state.status === 1 &&
    (!o.result || state.resultHash !== (await hash(o.result)))
  )
    throw new Error("The result hash does not match the confirmed payment");
  return state;
}
export async function verifySignature(
  wallet: string,
  message: string,
  sig: string,
) {
  const raw = key(wallet);
  const k = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "Ed25519",
    k,
    fromBase64(sig),
    enc.encode(message),
  );
}
export async function agentExists(
  c: ChainSettings,
  a: string,
  owner: string,
  uid: string,
  kind: number,
  price: number,
  name: string,
  description: string,
) {
  const { value } = await createSolanaRpc(c.rpcUrl)
    .getAccountInfo(address(a), { encoding: "base64", commitment: "confirmed" })
    .send();
  if (!value) return false;
  const b = fromBase64(value.data[0]);
  const discriminator = await disc("account:Agent");
  if (
    value.owner !== c.programId ||
    b.length < 106 ||
    !b.slice(0, 8).every((v, i) => v === discriminator[i]) ||
    getAddressDecoder().decode(b.slice(8, 40)) !== owner ||
    b[40] !== kind ||
    Number(new DataView(b.buffer).getBigUint64(41, true)) !== price ||
    !b.slice(73, 105).every((v, i) => v === unhex(uid)[i])
  )
    throw new Error("On-chain registration does not match this service");
  const view = new DataView(b.buffer);
  const nameLength = view.getUint32(106, true);
  if (nameLength > 96 || 110 + nameLength + 4 > b.length)
    throw new Error("Invalid agent data");
  const descriptionLength = view.getUint32(110 + nameLength, true);
  if (
    descriptionLength > 400 ||
    114 + nameLength + descriptionLength > b.length
  )
    throw new Error("Invalid service data");
  const decode = new TextDecoder();
  if (
    decode.decode(b.slice(110, 110 + nameLength)) !== name ||
    decode.decode(
      b.slice(114 + nameLength, 114 + nameLength + descriptionLength),
    ) !== description
  )
    throw new Error("Name or description differs from the record on Solana");
  return true;
}
