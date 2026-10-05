async function initWorkspaces(){
  state.workspaces=await api('/workspaces');
  const saved=sessionStorage.getItem('snaap-workspace');
  state.workspaceId=state.workspaces.find(w=>w.id===saved)?.id??state.workspaces.find(w=>w.is_default)?.id??state.workspaces[0]?.id;
  paintWorkspacePicker();
}
function paintWorkspacePicker(){
  const host=$('.workspace');
  const space=state.workspaces.find(w=>w.id===state.workspaceId);
  const markup=`<label class="workspace-label" for="workspace-select">เวิร์กสเปซ</label><div class="workspace-picker-row"><select id="workspace-select" aria-label="เวิร์กสเปซ">${state.workspaces.map(w=>`<option value="${w.id}" ${w.id===state.workspaceId?'selected':''}>${esc(w.name)}</option>`).join('')}</select><button type="button" class="text-button workspace-menu-toggle" aria-label="จัดการเวิร์กสเปซ" aria-expanded="false" aria-controls="workspace-actions">${uiIcon('more')}</button><div id="workspace-actions" class="workspace-actions" hidden><button type="button" data-add-space>${uiIcon('plus')}<span>เพิ่มเวิร์กสเปซ</span></button><button type="button" data-rename-space>${uiIcon('pencil')}<span>เปลี่ยนชื่อ</span></button>${space && !space.is_default ? `<button type="button" class="workspace-delete-action" data-delete-space>${uiIcon('trash')}<span>ลบเวิร์กสเปซ</span></button>` : ''}</div></div>`;
  const existing=host.querySelector('#workspace-select');
  if(existing){
    const template=document.createElement('template');template.innerHTML=markup;
    existing.innerHTML=template.content.querySelector('select').innerHTML;
    existing.value=state.workspaceId;
    host.querySelector('.workspace-actions').innerHTML=template.content.querySelector('.workspace-actions').innerHTML;
    existing.dispatchEvent(new Event('snaap-select-sync'));
  }else host.innerHTML=markup;
  const toggle=host.querySelector('.workspace-menu-toggle'),actions=host.querySelector('.workspace-actions');
  const closeMenu=()=>{actions.hidden=true;toggle.setAttribute('aria-expanded','false');};
  toggle.onclick=()=>{actions.hidden=!actions.hidden;toggle.setAttribute('aria-expanded',String(!actions.hidden));};
  actions.onclick=e=>{if(e.target.closest('button'))closeMenu();};
  host.onkeydown=e=>{if(e.key==='Escape'&&!actions.hidden){closeMenu();toggle.focus();}else if(e.key==='ArrowDown'&&e.target===toggle){e.preventDefault();actions.hidden=false;toggle.setAttribute('aria-expanded','true');actions.querySelector('button').focus();}};
  host.onfocusout=e=>{if(!host.contains(e.relatedTarget))closeMenu();};
  host.querySelector('select').onchange=e=>{
    switchWorkspace(e.target.value).catch(error=>toast(error.message));
  };
  let badge=$('[data-chat-workspace]');if(!badge){badge=document.createElement('span');badge.dataset.chatWorkspace='';badge.className='sr-only';workbenchToolbar.append(badge);}badge.textContent='เวิร์กสเปซ · '+(space?.name??'พื้นที่หลัก');
  host.querySelector('[data-add-space]').onclick=()=>{
    if(state.busy){toast('รอ snaap ตอบเสร็จก่อนสร้างเวิร์กสเปซ');return;}
    if(state.me?.plan!=='PRO'){toast('Free ใช้พื้นที่หลักได้ สร้างเวิร์กสเปซเพิ่มได้ใน Pro');return;}
    const dialog=document.createElement('dialog');dialog.className='workspace-dialog';
    dialog.innerHTML='<form><h2>เพิ่มเวิร์กสเปซ</h2><label>ชื่อเวิร์กสเปซ<input name="name" maxlength="60" required placeholder="เช่น MEXC หรือเซ็ตอัพระยะสั้น"></label><div class="row-actions"><button type="button" class="secondary" data-close>ยกเลิก</button><button class="primary">สร้าง</button></div></form>';
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const row=await api('/workspaces','POST',{name:dialog.querySelector('input').value});state.workspaces.push(row);await switchWorkspace(row.id);dialog.close();}catch(error){toast(error.message);button.disabled=false;}};
    document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
  };
  const renameWorkspace=()=>{
    const dialog=document.createElement('dialog');dialog.className='workspace-dialog';
    dialog.innerHTML=`<form><h2>เปลี่ยนชื่อเวิร์กสเปซ</h2><label>ชื่อเวิร์กสเปซ<input name="name" maxlength="60" required value="${esc(space.name)}"></label><div class="row-actions"><button type="button" class="secondary" data-close>ยกเลิก</button><button class="primary">บันทึก</button></div></form>`;
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const updated=await api('/workspaces/'+space.id,'PUT',{name:dialog.querySelector('input').value});Object.assign(space,updated);paintWorkspacePicker();dialog.close();toast('เปลี่ยนชื่อเวิร์กสเปซแล้ว');}catch(error){toast(error.message);e.submitter.disabled=false;}};
    document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
  };
  host.querySelector('[data-rename-space]').onclick=renameWorkspace;
  const deleteButton=host.querySelector('[data-delete-space]');
  if(deleteButton)deleteButton.onclick=()=>{
    if(state.busy){toast('รอ Snaap ตอบเสร็จก่อนลบเวิร์กสเปซ');return;}
    const primary=state.workspaces.find(w=>w.is_default);
    const dialog=document.createElement('dialog');dialog.className='workspace-dialog';
    dialog.innerHTML=`<h2>ลบเวิร์กสเปซ “${esc(space.name)}”?</h2><p>บทสนทนา เซ็ตอัพ และการใช้ข้อมูลจะย้ายไป “${esc(primary.name)}”</p><div class="row-actions"><button type="button" class="secondary" data-close autofocus>ยกเลิก</button><button type="button" class="secondary" data-confirm-delete>ลบเวิร์กสเปซ</button></div>`;
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    dialog.querySelector('[data-confirm-delete]').onclick=async e=>{
      const button=e.currentTarget;button.disabled=true;
      try{
        if(state.busy)throw Error('รอ Snaap ตอบเสร็จก่อนลบเวิร์กสเปซ');
        // Save the current draft before removing its workspace.
        await switchWorkspace(primary.id);
        await api('/workspaces/'+space.id,'DELETE');
        state.workspaces=state.workspaces.filter(w=>w.id!==space.id);
        paintWorkspacePicker();await refresh();navigate(location.hash.slice(1)||'home');
        dialog.close();toast('ลบเวิร์กสเปซแล้ว ข้อมูลย้ายไปพื้นที่หลัก');
      }catch(error){toast(error.message);button.disabled=false;}
    };
    document.body.append(dialog);dialog.showModal();
  };
}
let workspaceSwitching=false;
async function switchWorkspace(id){
  if(id===state.workspaceId){paintWorkspacePicker();return;}
  if(workspaceSwitching){paintWorkspacePicker();return;}
  if(state.saving){paintWorkspacePicker();toast('กำลังบันทึกเซ็ตอัพ รอสักครู่');return;}
  if(state.busy){paintWorkspacePicker();toast('รอ snaap ตอบเสร็จก่อนเปลี่ยนเวิร์กสเปซ');return;}
  if(!state.workspaces.some(w=>w.id===id))return;
  workspaceSwitching=true;
  const main=$('#main'),picker=$('#workspace-select');
  const loading=document.createElement('div');loading.className='workspace-switch-progress';loading.setAttribute('role','status');
  loading.textContent='กำลังเปิด '+state.workspaces.find(w=>w.id===id).name+'…';
  main.append(loading);main.classList.add('workspace-switching');main.inert=true;main.setAttribute('aria-busy','true');
  picker.disabled=true;picker.dispatchEvent(new Event('snaap-select-sync'));
  try{
    persistRecovery();
    // Do not discard an unsaved draft when its save fails.
    if(state.draft)await saveDraft();
    recoveryReady=false;
    state.workspaceId=id;sessionStorage.setItem('snaap-workspace',id);
    state.conversation=null;state.draft=null;state.saved=null;state.undo=[];state.images=[];state.libraryImages=[];state.replay=null;state.crop=null;state.persistedDraft=null;
    state.draftRevision=0;
    panel.replaceChildren();
    // Keep the workbench frame mounted; never flash the welcome screen mid-switch.
    $('#welcome').hidden=true;
    $('#messages').replaceChildren();$('#chat-input').value='';$('#followup-input').value='';state.useMyData=false;chatTools.querySelector('[data-context]').setAttribute('aria-checked','false');sources.hidden=true;sources.querySelector('.source-list').replaceChildren();renderImages();paintWorkspacePicker();
    await refresh();await restoreRecovery();
    if(workbench.hidden||!state.draft){showDesigner();setWorkbenchTab('chat');}
    if(state.useMyData){await refreshContext();await renderLabImageChoices(true);}
    const view=location.hash.slice(1)||'home';
    // Await the destination page, rather than revealing its previous workspace first.
    if(view==='history')await renderHistory();
    if(['notifications','watch'].includes(view))await renderNotifications();
    navigate(view,false);
    await new Promise(resolve=>requestAnimationFrame(()=>{sizeWorkbench();requestAnimationFrame(resolve);}));
    const target=$('#view-'+(view==='watch'?'notifications':view));
    if(target&&!matchMedia('(prefers-reduced-motion: reduce)').matches)target.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.22,1,.36,1)'});
  }finally{
    main.inert=false;main.removeAttribute('aria-busy');main.classList.remove('workspace-switching');loading.remove();workspaceSwitching=false;
    const current=$('#workspace-select');current.disabled=false;current.value=state.workspaceId;current.dispatchEvent(new Event('snaap-select-sync'));recoveryReady=true;
  }
}

document.addEventListener('click',e=>{
  if(e.target.closest('.workspace'))return;
  const actions=document.querySelector('.workspace-actions'),toggle=document.querySelector('.workspace-menu-toggle');
  if(actions){actions.hidden=true;toggle.setAttribute('aria-expanded','false');}
});
