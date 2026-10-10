export const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function unhex(v: string) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(v)) throw new Error("Invalid hex");
  return Uint8Array.from(v.match(/../g)!, (x) => parseInt(x, 16));
}
export async function hash(v: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  );
}
export const nonce = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const toBase64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
export const fromBase64 = (v: string) =>
  Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
