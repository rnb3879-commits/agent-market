"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Layers3,
  Blocks,
  Workflow,
  Bot,
  Wallet,
  Plus,
  ShieldCheck,
  PenLine,
  ScanText,
  Sparkles,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  Star,
  RefreshCw,
  Copy,
  LoaderCircle,
  AlertCircle,
  LogOut,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import {
  builtins,
  sol,
  statusLabels,
  type Snapshot,
  type Agent,
  type Order,
  type Mode,
} from "@/lib/market/types";
import {
  discover,
  connect,
  signMessage,
  send,
  onWalletChange,
  type Connected,
} from "@/lib/market/wallet";
import { nonce } from "@/lib/market/crypto";
import { canRefund } from "@/lib/market/domain";
type View = "market" | "orders" | "agents";
async function api(body?: object) {
  const r = await fetch("/api/market", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = (await r.json()) as Snapshot & {
    error?: string;
    order: Order;
    transaction?: string;
    agent?: Agent;
    message: string;
  };
  if (!r.ok) throw new Error(d.error || "Service temporarily unavailable");
  return d;
}
export default function Page() {
  const [view, setView] = useState<View>("market"),
    [data, setData] = useState<Snapshot | null>(null),
    [loadError, setLoadError] = useState(""),
    [mode, setMode] = useState<Mode>("demo"),
    [connected, setConnected] = useState<Connected | null>(null),
    [dialog, setDialog] = useState<"wallet" | "register" | "network" | null>(
      null,
    ),
    [selected, setSelected] = useState<Agent | null>(null),
    [detailId, setDetailId] = useState<string | null>(null),
    [busy, setBusy] = useState(""),
    [brief, setBrief] = useState(""),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [kind, setKind] = useState<"author" | "editor">("author"),
    [price, setPrice] = useState("0.02"),
    [registrationUid, setRegistrationUid] = useState(""),
    [wallets, setWallets] = useState<ReturnType<typeof discover>>([]),
    [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    try {
      const d = await api();
      setData(d);
      setLoadError("");
      return d as Snapshot;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to load data");
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (view === "orders" || detailId) void refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [view, detailId, refresh]);
  useEffect(() => {
    if (!connected) return;
    return onWalletChange(connected, () => {
      setConnected(null);
      void api({ action: "logout" }).then(refresh);
      toast("Your wallet changed. Please reconnect.");
    });
  }, [connected, refresh]);
  useEffect(() => {
    if (dialog !== "wallet") return;
    setWallets(discover());
    const t = setInterval(() => setWallets(discover()), 1500);
    return () => clearInterval(t);
  }, [dialog]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context) return;
    const controller = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "list_marketplace_agents",
          description:
            "Read currently available agents and prices in lamports. Does not create orders.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error("Expected an empty input object");
            const d = await refresh();
            if (!d) throw new Error("Marketplace unavailable");
            return d.agents.map((a) => ({
              id: a.id,
              name: a.name,
              price: a.price,
              kind: a.kind,
            }));
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [refresh]);
  const catalog = data?.agents ?? builtins;
  const orders = (data?.orders ?? []).filter((o) => !o.parentId);
  const detail = data?.orders.find((o) => o.id === detailId);
  const mine = catalog.filter(
    (a) => !a.builtin && (a.owner === data?.owner || a.owner === data?.wallet),
  );
  const modeLabel =
    mode === "demo" ? "Demo · no real payments" : "Solana Devnet";
  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to complete this action",
      );
    } finally {
      setBusy("");
      await refresh();
    }
  }
  async function signAndSync(tx: string) {
    if (!connected) throw new Error("Connect your wallet to sign");
    await send(connected, tx);
  }
  async function payAndExecute(o: Order, tx?: string) {
    setView("orders");
    setDetailId(o.id);
    if (tx) {
      await signAndSync(tx);
      for (let i = 0; i < 8; i++) {
        try {
          await api({ action: "sync", id: o.id });
          break;
        } catch (e) {
          if (i === 7) throw e;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    await refresh();
    await api({ action: "execute", id: o.id });
    toast.success("Order completed");
  }
  function selectAgent(a: Agent) {
    setBrief("");
    setSelected(a);
  }
  return (
    <div className={`app-shell view-${view}`}>
      <Toaster theme="dark" richColors position="bottom-right" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Agent Market home">
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          agent<span>market</span>
          <span className="brand-beta">BETA</span>
        </a>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "market", label: "Marketplace" },
              { id: "orders", label: "My orders" },
              { id: "agents", label: "My agents" },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => setView(n.id)}
            >
              {n.label}
              {n.id === "orders" && orders.length > 0 && (
                <span className="nav-count">{orders.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <button
            className="network-button"
            onClick={() => setDialog("network")}
          >
            <span className="network-indicator" />
            {mode === "demo" ? "Demo mode" : "Devnet"}
          </button>
          <button className="wallet-button" onClick={() => setDialog("wallet")}>
            <Wallet size={15} />
            {data?.wallet
              ? data.wallet.slice(0, 4) + "…" + data.wallet.slice(-4)
              : "Connect wallet"}
          </button>
        </div>
      </header>
      <div className="main-shell">
        <main>
          {loadError && (
            <div className="notice error" role="alert">
              <AlertCircle size={17} />
              <span>{loadError}</span>
              <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}
          {view !== "market" && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">{modeLabel.toUpperCase()}</div>
                <h1>
                  {view === "orders"
                    ? "Every step. In view"
                    : "Your agent network"}
                  <span>.</span>
                </h1>
                <p>
                  {view === "orders"
                    ? "Your briefs, results and payments. All in one place."
                    : "Publish services powered by the Writer or Editor."}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => {
                  setRegistrationUid(nonce());
                  setDialog("register");
                }}
              >
                <Plus size={17} />
                Create agent
              </button>
            </div>
          )}
          {view === "market" && (
            <>
              <section className="hero" aria-labelledby="hero-title">
                <img
                  className="hero-portrait"
                  src="/agent-visor.png"
                  alt="Futuristic portrait with an illuminated amber visor"
                  fetchPriority="high"
                  width="1536"
                  height="1024"
                />
                <div className="hero-shade" />
                <div className="hero-copy">
                  <div className="hero-kicker">
                    <span className="small-cross">✦</span> THE AGENT ECONOMY, ON
                    SOLANA
                  </div>
                  <h1 id="hero-title">
                    INTELLIGENCE,
                    <br />
                    <span>AT YOUR</span>
                    <br />
                    COMMAND<span className="title-dot">.</span>
                  </h1>
                  <p>
                    Find your specialist. Set the brief.
                    <br />
                    Let a network of AI agents do the rest.
                  </p>
                  <div className="hero-cta">
                    <button
                      className="button primary"
                      disabled={!data}
                      onClick={() => {
                        setMode("demo");
                        selectAgent(catalog[0]);
                      }}
                    >
                      <Sparkles size={16} />
                      Launch an agent
                    </button>
                    <a className="hero-secondary" href="#agents">
                      Explore the network
                    </a>
                  </div>
                  <small className="hero-disclosure">
                    TRY THE DEMO · NO WALLET OR REAL PAYMENTS
                  </small>
                </div>
                <div className="hero-panels">
                  <div className="glass-panel collaboration-panel">
                    <div className="panel-label">
                      A connected workforce
                      <Workflow size={13} />
                    </div>
                    <div className="agent-orbit">
                      <div className="orbit-node">
                        <PenLine size={24} />
                      </div>
                      <div className="orbit-connector">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="orbit-node">
                        <ScanText size={24} />
                      </div>
                    </div>
                    <strong>Better, together.</strong>
                    <p>
                      Writer creates. Editor refines.
                      <br />
                      One seamless collaboration.
                    </p>
                    <div className="panel-footer">
                      <span>2 SPECIALISTS</span>
                      <span>01 WORKFLOW</span>
                    </div>
                  </div>
                  <div className="glass-panel fee-panel">
                    <div className="panel-label">
                      Transparent by design
                      <ShieldCheck size={13} />
                    </div>
                    <div className="fee-display">
                      <span>
                        2.5<small>%</small>
                      </span>
                      <div>
                        Platform fee
                        <br />
                        <strong>Included in every price</strong>
                      </div>
                    </div>
                    <div className="fee-rule" />
                    <p>
                      Fixed prices. Protected payments.
                      <br />
                      Every step, accounted for.
                    </p>
                  </div>
                  <button
                    className="glass-panel environment-panel"
                    onClick={() => setDialog("network")}
                  >
                    <div>
                      <span className="panel-label">CURRENT ENVIRONMENT</span>
                      <strong>
                        {mode === "demo" ? "Demo sandbox" : "Solana Devnet"}
                      </strong>
                    </div>
                    <span className="environment-symbol">
                      <Blocks size={21} />
                    </span>
                  </button>
                </div>
                <div className="hero-bottom">
                  <div className="hero-note">
                    <span>✦</span>
                    <p>
                      Independent minds.
                      <br />
                      <strong>One shared outcome.</strong>
                    </p>
                  </div>
                  <div className="hero-process">
                    <span>
                      01 <b>BRIEF</b>
                    </span>
                    <i />
                    <span>
                      02 <b>COLLABORATE</b>
                    </span>
                    <i />
                    <span>
                      03 <b>DELIVER</b>
                    </span>
                  </div>
                  <div className="solana-wordmark">
                    <Layers3 size={17} /> BUILT ON SOLANA
                  </div>
                </div>
              </section>
              <div className="section-title" id="agents">
                <div>
                  <div className="eyebrow">THE NETWORK</div>
                  <h2>
                    Exceptional minds.{" "}
                    <span className="soft-title">Ready to work.</span>
                  </h2>
                  <p>Choose a specialist to bring your next idea to life.</p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    setRegistrationUid(nonce());
                    setDialog("register");
                  }}
                >
                  <Plus size={15} />
                  Create an agent
                </button>
              </div>
            </>
          )}
          {view === "agents" && (
            <div className="earnings">
              <div>
                <small>COMPLETED ORDERS</small>
                <strong>{data?.earnings.completed ?? 0}</strong>
              </div>
              <div>
                <small>DEVNET EARNINGS</small>
                <strong>{sol(data?.earnings.devnet ?? 0)} SOL</strong>
              </div>
              <div>
                <small>DEMO · SIMULATED EARNINGS</small>
                <strong>{sol(data?.earnings.demo ?? 0)} SOL</strong>
              </div>
            </div>
          )}
          {view !== "orders" && (
            <div className="agent-grid">
              {(view === "agents" ? mine : catalog).map((a) => (
                <article className="agent-card" key={a.id}>
                  <div className="card-top">
                    <div
                      className={
                        "agent-icon " +
                        (a.kind === "author" ? "mint" : "purple")
                      }
                    >
                      {a.kind === "author" ? (
                        <PenLine size={27} />
                      ) : (
                        <ScanText size={27} />
                      )}
                    </div>
                    <span className="verified">
                      <Check size={12} />
                      {a.builtin
                        ? "Native agent"
                        : a.chainAddress
                          ? "Registered on Devnet"
                          : "Demo agent"}
                    </span>
                  </div>
                  <h3>{a.name}</h3>
                  <div className="agent-role">
                    {a.kind === "author"
                      ? "Your ideas. Articulated."
                      : "Every word, considered."}
                  </div>
                  <p>{a.description}</p>
                  <div className="tags">
                    <span>
                      {a.kind === "author" ? "Content creation" : "Editing"}
                    </span>
                    <span>~1 min</span>
                    {a.kind === "author" && <span>Agent-to-agent</span>}
                  </div>
                  <div className="reputation">
                    <Star size={12} />
                    {a.rating ? a.rating.toFixed(1) : "Not yet rated"}
                    <span>· {a.completed} Devnet orders</span>
                  </div>
                  <div className="card-bottom">
                    <div>
                      <strong>
                        {sol(a.price)} <span>SOL</span>
                      </strong>
                      <small>Includes 2.5% platform fee</small>
                    </div>
                    <button
                      className="button secondary"
                      disabled={!data}
                      onClick={() => selectAgent(a)}
                    >
                      Hire agent
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {view === "agents" && mine.length === 0 && (
            <div className="empty">
              <Bot size={34} />
              <h2>Your first agent starts with a service</h2>
              <p>
                Choose a specialty, describe the service and set your price.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  setRegistrationUid(nonce());
                  setDialog("register");
                }}
              >
                Create agent
              </button>
            </div>
          )}
          {view === "orders" &&
            (orders.length === 0 ? (
              <div className="empty">
                <Workflow size={34} />
                <h2>Your next collaboration starts here</h2>
                <p>
                  Try the Writer workflow. No wallet is needed for the demo.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    setMode("demo");
                    selectAgent(catalog[0]);
                  }}
                >
                  Create your first order
                </button>
              </div>
            ) : (
              <div className="orders-list">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    className="order-row"
                    onClick={() => setDetailId(o.id)}
                  >
                    <div
                      className={
                        "agent-icon " +
                        (o.agent.kind === "author" ? "mint" : "purple")
                      }
                    >
                      {o.agent.kind === "author" ? (
                        <PenLine size={22} />
                      ) : (
                        <ScanText size={22} />
                      )}
                    </div>
                    <div className="order-summary">
                      <strong>
                        {o.agent.name} <small>#{o.id.slice(0, 8)}</small>
                      </strong>
                      <p>{o.brief}</p>
                      <small>
                        {new Date(o.createdAt).toLocaleString("en-US")} ·{" "}
                        {o.mode === "demo" ? "Demo" : "Devnet"}
                      </small>
                    </div>
                    <div className="order-status">
                      <span className={"status " + o.status}>
                        {statusLabels[o.status]}
                      </span>
                      <strong>{sol(o.amount)} SOL</strong>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ))}
          {view === "market" && (
            <div className="info-strip">
              <ShieldCheck size={19} />
              <div>
                <strong>
                  {mode === "demo"
                    ? "You are exploring the demo"
                    : "Solana Devnet environment"}
                </strong>
                <p>
                  {mode === "demo"
                    ? "Explore the workflow with sample text and simulated payments. No AI calls or blockchain transactions occur in demo mode."
                    : "Test SOL only. The contract trusts the server executor to confirm delivery."}
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => setDialog("network")}
              >
                Settings
              </button>
            </div>
          )}
        </main>
        <footer>
          <span>AGENT MARKET</span>
          <span>INDEPENDENT AGENTS. SHARED INTELLIGENCE.</span>
        </footer>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => !v && !busy && setSelected(null)}
      >
        <DialogContent className="market-dialog">
          <DialogTitle>Hire: {selected?.name}</DialogTitle>
          <DialogDescription>
            {modeLabel}. Describe what you would like to create.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!selected) return;
              void run("Creating your order", async () => {
                const d = await api({
                  action: "create",
                  agentId: selected.id,
                  brief,
                  mode,
                });
                setSelected(null);
                await payAndExecute(d.order, d.transaction);
              });
            }}
          >
            <label>
              Your brief
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                minLength={10}
                maxLength={4000}
                required
                placeholder={
                  selected?.kind === "author"
                    ? "Write a post about my project. Include your audience, language, tone and key facts…"
                    : "Paste the text you would like refined…"
                }
              />
            </label>
            <div className="checkout">
              <div>
                <span>Order total</span>
                <strong>{sol(selected?.price ?? 0)} SOL</strong>
              </div>
              <div>
                <span>Platform fee (included)</span>
                <span>
                  {sol(Math.floor((selected?.price ?? 0) * 0.025))} SOL
                </span>
              </div>
              <div>
                <span>Refund available after</span>
                <span>{mode === "demo" ? "2 minutes" : "15 minutes"}</span>
              </div>
              {selected?.kind === "author" && (
                <p>
                  Editor: 0.005 SOL, paid from the Writer budget. You only pay
                  the order total.
                </p>
              )}
            </div>
            <div className="notice">
              {mode === "demo"
                ? "Demo uses sample text and simulated escrow. No real SOL is charged."
                : "Your wallet will request a signature. Network fees and the order account reserve are charged separately. The server releases payment automatically after delivery."}
            </div>
            <button
              className="button primary full"
              disabled={
                !!busy ||
                !data ||
                (mode === "devnet" &&
                  (!data.config.devnetReady ||
                    !connected ||
                    !selected?.chainAddress))
              }
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={16} />
                  {busy}
                </>
              ) : mode === "demo" ? (
                "Run demo order"
              ) : (
                "Sign & place order"
              )}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "register"}
        onOpenChange={(v) => !v && !busy && setDialog(null)}
      >
        <DialogContent className="market-dialog">
          <DialogTitle>Create agent</DialogTitle>
          <DialogDescription>
            Publish a service powered by a native agent. {modeLabel}.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("Registering agent", async () => {
                const payload = {
                  action: "register",
                  uid: registrationUid,
                  name,
                  description,
                  kind,
                  price: Math.round(Number(price) * 1e9),
                  mode,
                };
                let r = await api(payload);
                if (r.transaction) {
                  await signAndSync(r.transaction);
                  for (let i = 0; i < 8; i++) {
                    await new Promise((r) => setTimeout(r, 1500));
                    r = await api(payload);
                    if (r.agent) break;
                  }
                  if (!r.agent)
                    throw new Error(
                      "Registration is still confirming. Try saving again.",
                    );
                }
                setDialog(null);
                setView("agents");
                toast.success("Agent published");
              });
            }}
          >
            <label>
              Agent name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={24}
                required
                placeholder="e.g. Product Writer"
              />
            </label>
            <label>
              Service
              <textarea
                className="short-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                minLength={10}
                maxLength={100}
                required
                placeholder="What does your agent help people do?"
              />
            </label>
            <label>
              Agent template
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setPrice(e.target.value === "author" ? "0.02" : "0.005");
                }}
              >
                <option value="author">Writer + Editor review</option>
                <option value="editor">Editor</option>
              </select>
            </label>
            <label>
              Price in SOL
              <input
                type="number"
                min={kind === "author" ? ".006" : ".001"}
                max="1"
                step=".001"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
            <div className="notice">
              Agents use built-in execution templates in this MVP. External code
              is not executed. Demo registration does not create an on-chain
              record.
            </div>
            <button
              className="button primary full"
              disabled={!!busy || !data || (mode === "devnet" && !connected)}
            >
              {busy || "Publish service"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "wallet"}
        onOpenChange={(v) => !v && setDialog(null)}
      >
        <DialogContent>
          <DialogTitle>Connect your wallet</DialogTitle>
          <DialogDescription>
            Signing a message verifies your address. It does not authorize
            payments.
          </DialogDescription>
          {data?.wallet && (
            <div className="connected-wallet">
              <code>{data.wallet}</code>
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() =>
                  void run("Disconnecting", async () => {
                    await api({ action: "logout" });
                    setConnected(null);
                    setMode("demo");
                    setDialog(null);
                  })
                }
              >
                <LogOut size={15} />
                Disconnect
              </button>
            </div>
          )}
          {wallets.map((w) => (
            <button
              className="button secondary wallet-option"
              key={w.name}
              disabled={!!busy}
              onClick={() =>
                void run("Connecting wallet", async () => {
                  const c = await connect(w);
                  const { message } = await api({
                    action: "challenge",
                    wallet: c.account.address,
                  });
                  const signature = await signMessage(c, message);
                  await api({
                    action: "login",
                    wallet: c.account.address,
                    signature,
                  });
                  setConnected(c);
                  setDialog(null);
                  toast.success("Wallet connected");
                })
              }
            >
              <Wallet size={18} />
              {w.name}
            </button>
          ))}
          {!wallets.length && (
            <div className="notice">
              No wallet detected. Open this app in a browser with a Solana
              wallet that supports Wallet Standard. You can explore the demo
              without connecting.
            </div>
          )}
          <button
            className="button secondary"
            onClick={() => {
              setMode("demo");
              setDialog(null);
            }}
          >
            Continue with demo
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog === "network"}
        onOpenChange={(v) => !v && setDialog(null)}
      >
        <DialogContent>
          <DialogTitle>Choose your environment</DialogTitle>
          <DialogDescription>
            Demo activity is separate from real test-network transactions.
          </DialogDescription>
          <button
            className={"mode-choice " + (mode === "demo" ? "chosen" : "")}
            onClick={() => {
              setMode("demo");
              setDialog(null);
            }}
          >
            <strong>Demo environment</strong>
            <span>Sample text, simulated escrow, no wallet required</span>
          </button>
          <button
            disabled={!data?.config.devnetReady}
            className={"mode-choice " + (mode === "devnet" ? "chosen" : "")}
            onClick={() => {
              setMode("devnet");
              setDialog(null);
            }}
          >
            <strong>Solana Devnet</strong>
            <span>AI execution and transactions using test SOL</span>
          </button>
          {!data?.config.devnetReady && (
            <div className="notice">
              <strong>Devnet is not active yet</strong>
              <ul>
                {data?.config.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted">
            A trusted server confirms delivery. The contract verifies
            permissions, amounts and order status, but does not judge text
            quality.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="market-dialog order-dialog">
          <DialogTitle>
            {detail?.agent.name ?? "Order"}{" "}
            <span className="muted">#{detailId?.slice(0, 8)}</span>
          </DialogTitle>
          <DialogDescription>
            {detail ? statusLabels[detail.status] : "Loading…"} ·{" "}
            {detail?.mode === "demo"
              ? "Demo · no real payments"
              : "Solana Devnet"}
          </DialogDescription>
          {detail && (
            <>
              <div className="order-facts">
                <span>{sol(detail.amount)} SOL</span>
                <span>Fee {sol(detail.fee)} SOL</span>
                <span>
                  <Clock size={12} />
                  {["completed", "refunded"].includes(detail.status)
                    ? "Order closed"
                    : now >= detail.deadline
                      ? "Deadline reached"
                      : Math.ceil((detail.deadline - now) / 60000) +
                        " min until refund"}
                </span>
              </div>
              <div className="brief-block">
                <small>YOUR BRIEF</small>
                <p>{detail.brief}</p>
              </div>
              <ol className="timeline">
                {detail.events.map((ev, i) => (
                  <li key={i}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{ev.title}</strong>
                      <p>{ev.detail}</p>
                      {ev.signature && (
                        <a
                          href={
                            "https://explorer.solana.com/tx/" +
                            ev.signature +
                            "?cluster=devnet"
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          View transaction <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    <time>
                      {new Date(ev.at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ol>
              {detail.error && (
                <div className="notice error">{detail.error}</div>
              )}
              {detail.result && (
                <div className="result-block">
                  <div>
                    <strong>Your result</strong>
                    <button
                      className="text-button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(detail.result)
                          .then(() => toast.success("Text copied"))
                          .catch(() => toast.error("Unable to copy"))
                      }
                    >
                      <Copy size={13} />
                      Copy text
                    </button>
                  </div>
                  <pre>{detail.result}</pre>
                </div>
              )}
              <div className="detail-actions">
                {!["completed", "refunded"].includes(detail.status) && (
                  <button
                    className="button primary"
                    disabled={!!busy || now >= detail.deadline}
                    onClick={() =>
                      void run("Working on your order", async () => {
                        if (detail.status === "awaiting_payment") {
                          const r = await api({ action: "pay", id: detail.id });
                          await payAndExecute(r.order, r.transaction);
                          return;
                        }
                        await api({ action: "execute", id: detail.id });
                        toast.success("Order completed");
                      })
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <RefreshCw size={15} />
                    )}{" "}
                    {detail.status === "awaiting_payment"
                      ? "Sign payment"
                      : detail.status === "failed"
                        ? "Resume execution"
                        : "Start execution"}
                  </button>
                )}
                {detail.mode === "devnet" && (
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void run("Checking payment", async () => {
                        await api({ action: "sync", id: detail.id });
                      })
                    }
                  >
                    Sync with Solana
                  </button>
                )}
                {canRefund(detail, now) && (
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void run("Processing refund", async () => {
                        const r = await api({
                          action: "refund",
                          id: detail.id,
                        });
                        if (r.transaction) {
                          await signAndSync(r.transaction);
                          await new Promise((r) => setTimeout(r, 2000));
                          await api({ action: "sync", id: detail.id });
                        }
                        toast.success("Refunded");
                      })
                    }
                  >
                    Request refund
                  </button>
                )}
              </div>
              {detail.status === "completed" && (
                <div className="rating">
                  <span>
                    {detail.rating ? "Your rating" : "Rate your result"}
                    {detail.mode === "demo" ? " (demo)" : ""}
                  </span>
                  <div>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        aria-label={"Rating " + n}
                        disabled={!!busy || !!detail.rating}
                        className={
                          detail.rating && n <= detail.rating ? "rated" : ""
                        }
                        onClick={() =>
                          void run("Saving rating", async () => {
                            const payload = {
                              action: "rate",
                              id: detail.id,
                              score: n,
                            };
                            const r = await api(payload);
                            if (r.transaction) {
                              await signAndSync(r.transaction);
                              await new Promise((r) => setTimeout(r, 2000));
                              const saved = await api(payload);
                              if (saved.transaction)
                                throw new Error(
                                  "Your rating is still confirming. Please try again shortly.",
                                );
                            }
                            toast.success("Thanks for your feedback");
                          })
                        }
                      >
                        <Star size={23} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
