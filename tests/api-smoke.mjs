import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
let cookie = "";
let assertions = 0;
async function request(body, other = false) {
  const r = await fetch(base + "/api/market", {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: base } : {}),
      ...(!other && cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!other && r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return { status: r.status, data: await r.json() };
}
function ok(value, message) {
  assert.ok(value, message);
  assertions++;
}
const initial = await request();
ok(initial.status === 200, "snapshot loads");
ok(!initial.data.config.devnetReady, "live payments disabled until configured");
const created = await request({
  action: "create",
  agentId: "author",
  brief: "Write a post about an AI agent marketplace in English",
  mode: "demo",
});
ok(created.status === 200, "create order");
const id = created.data.order.id;
const foreign = await request({ action: "execute", id }, true);
ok(foreign.status === 400, "other session cannot execute order");
const executed = await request({ action: "execute", id });
ok(executed.status === 200, JSON.stringify(executed.data));
ok(executed.data.order.status === "completed", "parent completes");
ok(executed.data.order.childId, "editor child created");
ok(
  executed.data.order.result.includes("AI is not connected"),
  "result explicitly demo",
);
const rerun = await request({ action: "execute", id });
ok(
  rerun.data.order.childId === executed.data.order.childId,
  "retry does not create second child",
);
ok(
  rerun.data.order.events.length === executed.data.order.events.length,
  "retry does not duplicate settlement",
);
ok(
  (await request({ action: "refund", id })).status === 400,
  "completed orders cannot refund",
);
ok(
  (await request({ action: "rate", id, score: 5 })).status === 200,
  "rating saved",
);
ok(
  (await request({ action: "rate", id, score: 2 })).status === 400,
  "duplicate rating blocked",
);
const snap = await request();
ok(snap.data.orders.find((o) => o.id === id).rating === 5, "rating persists");
ok(
  snap.data.agents.find((a) => a.id === "author").reviews === 0,
  "demo ratings do not inflate live reputation",
);
ok(
  (
    await request({
      action: "create",
      agentId: "author",
      brief: "Это запрос для проверки Devnet",
      mode: "devnet",
    })
  ).status === 400,
  "unconfigured devnet rejected",
);
ok(
  (
    await request({
      action: "create",
      agentId: "author",
      brief: "x",
      mode: "demo",
    })
  ).status === 400,
  "short brief rejected",
);
const invalidOrigin = await fetch(base + "/api/market", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://example.org",
    Cookie: cookie,
  },
  body: JSON.stringify({ action: "logout" }),
});
ok(invalidOrigin.status >= 400, "cross-origin mutation rejected");
const registered = await request({
  action: "register",
  uid: "a".repeat(32) + crypto.randomUUID().replaceAll("-", ""),
  name: "Test editor",
  description: "Edits text to verify agent registration",
  kind: "editor",
  price: 5000000,
  mode: "demo",
});
ok(registered.status === 200, "agent registers");
ok(
  (await request()).data.agents.some((a) => a.id === registered.data.agent.id),
  "agent persists",
);
const editorOrder = await request({
  action: "create",
  agentId: registered.data.agent.id,
  brief: "Отредактируй этот текст:  привет   мир.",
  mode: "demo",
});
const editor = await request({
  action: "execute",
  id: editorOrder.data.order.id,
});
ok(
  editor.data.order.status === "completed" && !editor.data.order.childId,
  "standalone editor completes without subcontract",
);
console.log(
  JSON.stringify({
    passed: assertions,
    authorOrder: id,
    editorOrder: editorOrder.data.order.id,
  }),
);
