// Operator-only bootstrap. Never imported by the web app.
import { readFile } from "node:fs/promises";
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  address,
} from "@solana/kit";
import {
  buildInitialize,
  buildRegister,
  sendExecutor,
  pda,
  agentExists,
} from "../lib/market/chain";
import { hash } from "../lib/market/crypto";
import { builtins } from "../lib/market/types";
const [programId, keyFile, treasury, confirmation] = process.argv.slice(2);
if (!programId || !keyFile || !treasury || confirmation !== "--confirm-devnet")
  throw new Error(
    "Usage: npm run setup:devnet -- PROGRAM_ID KEYPAIR_FILE TREASURY --confirm-devnet",
  );
const secret = await readFile(keyFile, "utf8");
const signer = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(secret)),
);
const c = {
  programId,
  rpcUrl: "https://api.devnet.solana.com",
  executor: signer.address,
  executorSecret: secret,
  treasury,
};
const rpc = createSolanaRpc(c.rpcUrl);
const { value: program } = await rpc
  .getAccountInfo(address(programId), { encoding: "base64" })
  .send();
if (!program?.executable)
  throw new Error("Program must be deployed to Devnet first.");
const config = await pda(c, "config");
if (!(await rpc.getAccountInfo(config, { encoding: "base64" }).send()).value) {
  await sendExecutor(c, await buildInitialize(c, signer.address));
}
console.log(
  "SOLANA_PROGRAM_ID=" +
    programId +
    "\nEXECUTOR_ADDRESS=" +
    signer.address +
    "\nTREASURY_ADDRESS=" +
    treasury,
);
for (const a of builtins) {
  const uid = await hash("agent-market:" + a.id);
  const agent = await pda(c, "agent", signer.address, uid);
  if (
    !(await agentExists(
      c,
      agent,
      signer.address,
      uid,
      a.kind === "author" ? 0 : 1,
      a.price,
      a.name,
      a.description,
    ))
  ) {
    await sendExecutor(
      c,
      await buildRegister(
        c,
        signer.address,
        uid,
        a.name,
        a.description,
        a.kind === "author" ? 0 : 1,
        a.price,
      ),
    );
  }
  console.log(a.id.toUpperCase() + "_AGENT_ADDRESS=" + agent);
}
console.log(
  "Store EXECUTOR_SECRET securely as a server secret, never in client variables. Enable Devnet only after contract acceptance tests.",
);
