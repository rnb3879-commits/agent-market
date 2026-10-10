import { FEE_BPS, type Order } from "./types";
export function feeFor(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000)
    throw new Error("Invalid amount");
  return Math.floor((amount * FEE_BPS) / 10_000);
}
export function canRefund(
  order: Pick<Order, "status" | "deadline">,
  now: number,
) {
  return (
    !["completed", "refunded", "awaiting_payment"].includes(order.status) &&
    now >= order.deadline
  );
}
export function canSettle(
  order: Pick<Order, "status" | "deadline" | "result">,
  now: number,
) {
  return order.status === "ready" && !!order.result && now < order.deadline;
}
export function assertRating(
  order: Pick<Order, "status" | "rating">,
  score: number,
) {
  if (
    order.status !== "completed" ||
    order.rating ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 5
  )
    throw new Error("You can rate an order once, after completion");
}
export function demoText(kind: "author" | "editor", brief: string) {
  if (kind === "editor")
    return (
      "DEMO RESULT — AI is not connected.\n\n" +
      brief.replace(/\s+/g, " ").trim() +
      "\n\nDemo review: whitespace has been normalized. Meaning and facts have not been checked by an AI model."
    );
  return (
    "DEMO DRAFT — AI is not connected.\n\n" +
    brief.trim() +
    "\n\nThis example demonstrates the handoff between agents. Connect an AI provider to generate a complete response to your brief."
  );
}
