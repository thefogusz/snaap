import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { diffSetup, describeSetupValue } from "../dist/setup-changes.js";
const source = await readFile(
  new URL("../dist/workbench.js", import.meta.url),
  "utf8",
);
const receiptSource = source.slice(
  source.indexOf("async function showSetupChanges("),
  source.indexOf("async function showChatSetupCard("),
);
async function receipt() {
  const before = { name: "before" },
    after = { name: "after" };
  let listener: () => void = () => {},
    saves = 0;
  const button = {
    disabled: false,
    addEventListener: (_name: string, fn: () => void) => (listener = fn),
  };
  const label = { textContent: "" };
  const card = {
    className: "",
    innerHTML: "",
    setAttribute: () => {},
    querySelector: (key: string) => (key === "small" ? label : button),
  };
  const state = {
    conversation: "a",
    workspaceId: "one",
    draft: after,
    busy: false,
    undo: [before],
    replay: {},
    destinations: [],
  };
  const context = vm.createContext({
    state,
    structuredClone,
    setupChangesReady: Promise.resolve({ diffSetup, describeSetupValue }),
    document: { createElement: () => card },
    esc: String,
    $: () => ({ append: () => {} }),
    toast: () => {},
    renderDesigner: () => {},
    queueDraftSave: () => saves++,
  });
  vm.runInContext(
    receiptSource + ";globalThis.runReceipt=showSetupChanges;",
    context,
  );
  await context.runReceipt(before, after);
  return { state, button, label, click: () => listener(), saves: () => saves };
}
test("chat undo restores only the exact current draft and invalidates replay", async () => {
  const r = await receipt();
  r.click();
  assert.equal(r.state.draft.name, "before");
  assert.equal(r.state.replay, null);
  assert.equal(r.saves(), 1);
  assert.equal(r.button.disabled, true);
});
test("chat undo cannot overwrite later edits or another conversation/workspace", async () => {
  for (const change of [
    (s: any) => (s.draft = { name: "later" }),
    (s: any) => (s.conversation = "b"),
    (s: any) => (s.workspaceId = "two"),
    (s: any) => (s.busy = true),
  ]) {
    const r = await receipt();
    change(r.state);
    const expected = JSON.stringify(r.state.draft);
    r.click();
    assert.equal(JSON.stringify(r.state.draft), expected);
    assert.equal(r.saves(), 0);
  }
});
const historySource = source.slice(
  source.indexOf("let historyGeneration=0;"),
  source.indexOf("let conversationSelection=0;"),
);
test("delayed history cannot render into another conversation or workspace", async () => {
  for (const field of ["conversation", "workspaceId"]) {
    let resolve!: (rows: any[]) => void,
      rendered = 0;
    const state: any = { conversation: "a", workspaceId: "one" };
    const context = vm.createContext({
      state,
      api: () => new Promise((r) => (resolve = r)),
      message: () => rendered++,
    });
    vm.runInContext(
      historySource + ";globalThis.loadHistory=loadChatHistory;",
      context,
    );
    const pending = context.loadHistory();
    state[field] = "changed";
    resolve([{ role: "assistant", content: "old" }]);
    await pending;
    assert.equal(rendered, 0);
  }
});
test("new history request supersedes an older request for the same conversation", async () => {
  const resolvers: Array<(rows: any[]) => void> = [];
  const rendered: string[] = [];
  const context = vm.createContext({
    state: { conversation: "a", workspaceId: "one", conversationRows: [] },
    api: () => new Promise((r) => resolvers.push(r)),
    message: (text: string) => rendered.push(text),
    requestAnimationFrame: () => {},
    scrollChatToLatest: () => {},
  });
  vm.runInContext(
    historySource + ";globalThis.loadHistory=loadChatHistory;",
    context,
  );
  const first = context.loadHistory(),
    second = context.loadHistory();
  resolvers[1]([{ role: "assistant", content: "new" }]);
  await second;
  resolvers[0]([{ role: "assistant", content: "old" }]);
  await first;
  assert.deepEqual(rendered, ["new"]);
});
test("historical AI proposals without an accepted stored draft do not create a save card", async () => {
  let cards = 0;
  const context = vm.createContext({
    state: {
      conversation: "a",
      workspaceId: "one",
      conversationRows: [{ id: "a", draft: null }],
    },
    api: async () => [
      { role: "assistant", content: "proposal", setup_changes: [{}] },
    ],
    message: () => {},
    showSetupChanges: async () => {},
    showChatSetupCard: async () => cards++,
    requestAnimationFrame: () => {},
    scrollChatToLatest: () => {},
  });
  vm.runInContext(
    historySource + ";globalThis.loadHistory=loadChatHistory;",
    context,
  );
  await context.loadHistory();
  assert.equal(cards, 0);
});
const refreshSource=source.slice(source.indexOf('let refreshGeneration=0;'),source.indexOf('async function refreshContext('));
test('delayed refresh cannot replace data from a different workspace',async()=>{
  const pending:Array<(value:any)=>void>=[];
  const state={workspaceId:'one',rules:['original']};
  const context=vm.createContext({state,api:()=>new Promise(resolve=>pending.push(resolve))});
  vm.runInContext(refreshSource+';globalThis.runRefresh=refresh;',context);
  const flight=context.runRefresh();state.workspaceId='two';
  pending.forEach((resolve,i)=>resolve(i===0?['old']:{}));await flight;
  assert.deepEqual(state.rules,['original']);
});
