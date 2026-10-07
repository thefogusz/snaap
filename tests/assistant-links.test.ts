import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('assistant citations link safe bare URLs without nested anchors, images or code links', () => {
 const element=(tagName='')=>({tagName,children:[] as any[],textContent:'',classList:{add(){}},append(...children:any[]){this.children.push(...children);},replaceChildren(...children:any[]){this.children=children;}});
 const document={createElement:element,createTextNode:(text:string)=>({...element('#text'),textContent:text}),createDocumentFragment:()=>element('#fragment')};
 const context=vm.createContext({document,URL});
 vm.runInContext(readFileSync('dist/assistant-text.js','utf8').replace('export function renderAssistantText','function renderAssistantText'),context);
 const root=element('div');
 context.renderAssistantText(root,'Evidence: https://etherscan.io/tx/abc, (https://defillama.com/chain/Base). https://example.com/token_(a)\n\n[https://example.com](https://example.com) ![image](https://example.com/image) [bad](javascript:alert) https://user:pass@example.com\n\n`https://example.com/code`\n\n```\nhttps://example.com/fenced\n```');
 const nodes:any[]=[];const visit=(node:any)=>{nodes.push(node);node.children.forEach(visit);};visit(root);
 const links=nodes.filter(n=>n.tagName==='a');
 assert.deepEqual(links.map(n=>n.href),['https://etherscan.io/tx/abc','https://defillama.com/chain/Base','https://example.com/token_(a)','https://example.com/']);
 assert.ok(links.every(n=>n.target==='_blank'&&n.rel==='noopener noreferrer'));
 assert.equal(nodes.filter(n=>n.tagName==='img').length,0);
 const containsAnchor=(node:any):boolean=>node.children.some((n:any)=>n.tagName==='a'||containsAnchor(n));
 assert.ok(links.every(n=>!containsAnchor(n)));
});
