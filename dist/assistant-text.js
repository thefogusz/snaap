// Render the chat's common Markdown using DOM text nodes. Model output is never
// interpreted as HTML, and images cannot trigger external requests.
function inline(parent,text,depth=0) {
  if(depth>5){parent.append(document.createTextNode(text));return;}
  const pattern=/(`+)([^\n]*?)\1|\*\*([^\n]+?)\*\*|__([^\n]+?)__|\*([^*\n]+?)\*|(?<![\p{L}\p{N}])_([^_\n]+?)_(?![\p{L}\p{N}])|(!?)\[([^\]\n]+)\]\(([^\s)]+)\)/gu;
  let offset=0;
  for(const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(offset,match.index)));
    let node;
    if(match[1]){node=document.createElement('code');node.textContent=match[2];}
    else if(match[3]||match[4]){node=document.createElement('strong');inline(node,match[3]??match[4],depth+1);}
    else if(match[5]||match[6]){node=document.createElement('em');inline(node,match[5]??match[6],depth+1);}
    else {
      let url;try{url=new URL(match[9]);}catch{}
      if(!match[7]&&url&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password){
        node=document.createElement('a');node.href=url.href;node.target='_blank';node.rel='noopener noreferrer';inline(node,match[8],depth+1);
      }else{node=document.createElement('span');node.textContent=match[8];}
    }
    parent.append(node);offset=match.index+match[0].length;
  }
  parent.append(document.createTextNode(text.slice(offset)));
}
const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim());
const listItem=line=>/^(\s*)(?:([-+*])|(\d+)[.)])\s+(.+)$/.exec(line);
const tableRule=line=>line.includes('|')&&cells(line).every(cell=>/^:?-{3,}:?$/.test(cell));
const blockStart=line=>/^\s*(?:#{1,6}\s|`{3,}|~{3,}|>\s?|(?:[-+*]|\d+[.)])\s+|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(line);

export function renderAssistantText(container,text) {
  const fragment=document.createDocumentFragment();
  const lines=String(text).replace(/\r\n?/g,'\n').split('\n');
  for(let i=0;i<lines.length;) {
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    const fence=/^\s*(`{3,}|~{3,})/.exec(line);
    if(fence){
      const content=[];i++;
      while(i<lines.length&&!new RegExp('^\\s*'+fence[1][0]+'{'+fence[1].length+',}\\s*$').test(lines[i]))content.push(lines[i++]);
      if(i<lines.length)i++;
      const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=content.join('\n');pre.append(code);fragment.append(pre);continue;
    }
    const heading=/^\s*(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if(heading){const title=document.createElement('h'+Math.min(6,heading[1].length+1));inline(title,heading[2]);fragment.append(title);i++;continue;}
    if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){fragment.append(document.createElement('hr'));i++;continue;}
    if(/^\s*>/.test(line)){
      const quote=document.createElement('blockquote'),parts=[];
      while(i<lines.length&&/^\s*>/.test(lines[i]))parts.push(lines[i++].replace(/^\s*>\s?/,''));
      renderAssistantText(quote,parts.join('\n'));fragment.append(quote);continue;
    }
    if(i+1<lines.length&&line.includes('|')&&tableRule(lines[i+1])){
      const wrapper=document.createElement('div');wrapper.className='assistant-table';
      const table=document.createElement('table'),head=document.createElement('thead'),headRow=document.createElement('tr');
      for(const cell of cells(line)){const th=document.createElement('th');th.scope='col';inline(th,cell);headRow.append(th);}head.append(headRow);table.append(head);i+=2;
      const body=document.createElement('tbody');
      while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const row=document.createElement('tr');for(const cell of cells(lines[i++])){const td=document.createElement('td');inline(td,cell);row.append(td);}body.append(row);}
      table.append(body);wrapper.append(table);fragment.append(wrapper);continue;
    }
    const item=listItem(line);
    if(item){
      const ordered=Boolean(item[3]),list=document.createElement(ordered?'ol':'ul');
      if(ordered)list.start=Number(item[3]);
      while(i<lines.length){const next=listItem(lines[i]);if(!next||Boolean(next[3])!==ordered)break;const li=document.createElement('li');inline(li,next[4]);list.append(li);i++;}
      fragment.append(list);continue;
    }
    const paragraph=document.createElement('p'),parts=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!blockStart(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&tableRule(lines[i+1])))parts.push(lines[i++]);
    // Preserve intentional hard breaks while letting ordinary prose reflow.
    parts.forEach((part,index)=>{inline(paragraph,part.replace(/ {2,}$/,''));if(index<parts.length-1)paragraph.append(/ {2,}$/.test(part)?document.createElement('br'):document.createTextNode(' '));});
    fragment.append(paragraph);
  }
  container.replaceChildren(fragment);container.classList.add('assistant-rich-text');
}
