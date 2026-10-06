import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
function fixture(fail = false, pending?: Promise<void>) {
  const state = { images: [{ id: 'image-1', name: 'chart.png', url: '/api/v1/images/image-1' }], libraryImages: [], health: { ai: true }, busy: false, conversation: 'conversation', draft: {}, useMyData: false };
  const elements = new Map<string, any>(); const submitted: any[] = []; const painted: any[] = []; let visible = 1;
  const element = () => ({ value: 'question', append(node: any) { if(node.src)painted.push(node); }, remove() {}, setAttribute() {}, querySelector: () => ({ textContent: '' }) });
  const context = vm.createContext({ state, workbench: { dataset: { tab: 'split' } }, location: {},
    document: { createElement: element }, $: (key: string) => { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); }, $$: () => [],
    hasEntryCondition: () => true, window: {SnaapRouter: {go() {}}}, sources: { querySelectorAll: () => [] }, message() {}, toast() {}, followingChat: false,
    requestAnimationFrame() {}, scrollChatToLatest() {}, resizeChatInputs() {}, showDesigner() {},
    setTimeout: () => 1, clearTimeout() {}, ensureConversation: async () => {}, saveDraft: async () => {},
    renderImages() { visible = state.images.filter((image: any) => !image.sent).length; }, persistRecovery() {}, appendChatImages: (images: any[]) => painted.push(images),
    refresh: async () => {}, api: async (_: string, __: string, body: any) => { submitted.push(body); if (pending) await pending; if (fail) throw new Error('provider failed'); return { text: 'done' }; },
  });
  vm.runInContext(source.slice(0, source.indexOf('// Register before dynamic imports')) + '\n' + source.slice(source.indexOf('async function chat(text)'), source.indexOf('function renderImages()')) + ';globalThis.runChat=chat;', context);
  return { state, submitted, painted, elements, get visible() { return visible; }, chat: context.runChat as (text: string) => Promise<void> };
}

test('sending hides composer previews immediately while keeping image IDs in the pending request', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(false, gate); const pending = f.chat('first');
  assert.equal(f.visible, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(f.submitted[0].imageIds), ['image-1']);
  release(); await pending; assert.equal(f.visible, 0);
  await f.chat('follow-up'); assert.deepEqual(Array.from(f.submitted[1].imageIds), ['image-1']);
  assert.equal(f.painted.length, 1, 'follow-up must not display old images as newly attached');
});
test('successful image chat keeps original images for a follow-up without reupload', async () => {
  const f = fixture(); await f.chat('first'); assert.equal(f.state.images.length, 1);
  await f.chat('follow-up'); assert.deepEqual(Array.from(f.submitted[1].imageIds), ['image-1']);
  assert.equal(f.painted.length, 1);
});
test('failed image request keeps images and restores unsent question', async () => {
  const f = fixture(true); await f.chat('retry this');
  assert.equal(f.state.images.length, 1); assert.equal(f.elements.get('#followup-input').value, 'retry this'); assert.equal(f.state.busy, false);
  assert.equal(f.visible, 1);
});
test('recovery resolves stored IDs against accessible images; removed previews stay removed', async () => {
  const state = { conversation: 'current', images: [] };
  const context = vm.createContext({ state, renderImages() {}, api: async () => [{ id: 'available', name: 'chart.png' }] });
  vm.runInContext(source.slice(source.indexOf('async function restoreChatImages('), source.indexOf('function renderImages()'))+';globalThis.restore=restoreChatImages;',context);
  await context.restore(['deleted', 'available']); assert.equal(state.images.length,1);
  assert.equal((state.images[0] as any).id, 'available');
  await context.restore([]); assert.equal(state.images.length,0);
  await context.restore(['available'], ['available']);
  assert.equal((state.images[0] as any).sent, true, 'recovery must not return sent images to the composer');
  await context.restore(['available'], []);
  assert.equal((state.images[0] as any).sent, false, 'unsent images remain visible after recovery');
});
test('an old conversation recovery response cannot replace the current attachments', async () => {
  const state = { conversation: 'old', images: [{ id: 'current-image' }] }; let release: (rows: any[]) => void = () => {};
  const context = vm.createContext({ state, renderImages() {}, api: () => new Promise(resolve => {release=resolve;}) });
  vm.runInContext(source.slice(source.indexOf('async function restoreChatImages('), source.indexOf('function renderImages()'))+';globalThis.restore=restoreChatImages;',context);
  const pending=context.restore();state.conversation='new';release([{id:'old-image'}]);await pending;
  assert.equal(state.images[0].id,'current-image');
});
