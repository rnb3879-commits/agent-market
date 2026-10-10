import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { toBase64, fromBase64 } from "./crypto";
import { getBase58Decoder } from "@solana/kit";
export type Connected = { wallet: Wallet; account: WalletAccount };
export function discover() {
  return getWallets()
    .get()
    .filter(
      (w) =>
        w.features["standard:connect"] &&
        w.features["solana:signMessage"] &&
        w.features["solana:signAndSendTransaction"] &&
        w.chains.includes("solana:devnet"),
    );
}
export async function connect(wallet: Wallet) {
  const feature = wallet.features["standard:connect"] as {
    connect: () => Promise<{ accounts: WalletAccount[] }>;
  };
  const { accounts } = await feature.connect();
  const account = accounts.find((a) => a.chains.includes("solana:devnet"));
  if (!account)
    throw new Error("Your wallet did not provide a Solana Devnet account");
  return { wallet, account };
}
export async function signMessage(c: Connected, message: string) {
  const f = c.wallet.features["solana:signMessage"] as {
    signMessage: (x: {
      account: WalletAccount;
      message: Uint8Array;
    }) => Promise<{ signature: Uint8Array }[]>;
  };
  return toBase64(
    (
      await f.signMessage({
        account: c.account,
        message: new TextEncoder().encode(message),
      })
    )[0].signature,
  );
}
export async function send(c: Connected, wire: string) {
  const f = c.wallet.features["solana:signAndSendTransaction"] as {
    signAndSendTransaction: (x: {
      account: WalletAccount;
      transaction: Uint8Array;
      chain: "solana:devnet";
      options: { preflightCommitment: "confirmed" };
    }) => Promise<{ signature: Uint8Array }[]>;
  };
  const [r] = await f.signAndSendTransaction({
    account: c.account,
    transaction: fromBase64(wire),
    chain: "solana:devnet",
    options: { preflightCommitment: "confirmed" },
  });
  return getBase58Decoder().decode(r.signature);
}
export function onWalletChange(c: Connected, fn: () => void) {
  const f = c.wallet.features["standard:events"] as
    | {
        on?: (
          event: "change",
          listener: (e: { accounts?: readonly WalletAccount[] }) => void,
        ) => () => void;
      }
    | undefined;
  return f?.on?.("change", (e) => {
    if (e.accounts && !e.accounts.some((a) => a.address === c.account.address))
      fn();
  });
}
