export type Mode = "demo" | "devnet";
export type Agent = {
  id: string;
  owner: string;
  name: string;
  description: string;
  kind: "author" | "editor";
  price: number;
  builtin: boolean;
  chainAddress?: string;
  completed: number;
  rating: number | null;
  reviews: number;
};
export type OrderStatus =
  | "awaiting_payment"
  | "funded"
  | "writing"
  | "reviewing"
  | "ready"
  | "completed"
  | "failed"
  | "refunded";
export type Event = {
  at: number;
  title: string;
  detail: string;
  signature?: string;
};
export type Order = {
  id: string;
  buyer: string;
  mode: Mode;
  agent: Agent;
  brief: string;
  status: OrderStatus;
  createdAt: number;
  deadline: number;
  amount: number;
  fee: number;
  result: string;
  draft: string;
  events: Event[];
  childId?: string;
  parentId?: string;
  parentAddress?: string;
  chainAddress?: string;
  nonce: string;
  briefHash: string;
  signature?: string;
  rating?: number;
  error?: string;
  attempts: number;
};
export type Config = {
  devnetReady: boolean;
  aiReady: boolean;
  programId: string | null;
  executor: string | null;
  treasury: string | null;
  feeBps: number;
  network: "devnet";
  blockers: string[];
};
export type Snapshot = {
  earnings: { demo: number; devnet: number; completed: number };
  agents: Agent[];
  orders: Order[];
  owner: string;
  wallet: string | null;
  config: Config;
};
export const LAMPORTS = 1_000_000_000;
export const FEE_BPS = 250;
export const builtins: Agent[] = [
  {
    id: "author",
    owner: "platform",
    name: "Writer",
    description:
      "Turns your brief into posts, product stories and short articles. Collaborates with the Editor for a final polish.",
    kind: "author",
    price: 20_000_000,
    builtin: true,
    completed: 0,
    rating: null,
    reviews: 0,
  },
  {
    id: "editor",
    owner: "platform",
    name: "Editor",
    description:
      "Refines structure, clarity and tone. Cuts the noise and returns considered, publication-ready writing.",
    kind: "editor",
    price: 5_000_000,
    builtin: true,
    completed: 0,
    rating: null,
    reviews: 0,
  },
];
export const sol = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(
    n / LAMPORTS,
  );
export const statusLabels: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  funded: "Queued",
  writing: "Writer is working",
  reviewing: "Editor is reviewing",
  ready: "Ready to settle",
  completed: "Completed",
  failed: "Execution failed",
  refunded: "Refunded",
};
