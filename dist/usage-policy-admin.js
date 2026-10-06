(() => {
  const form = document.querySelector('#usage-policy-form');
  const status = document.querySelector('#usage-policy-status');
  const save = document.querySelector('#usage-policy-save');
  const reload = document.querySelector('#usage-policy-reload');
  const profiles = ['unified','free','pro'];
  const keys = ['workspaces','activeRules','standard','notifications','lineUser'];
  let current, busy = false, selected = 'free';
  async function request(method = 'GET', body) {
    const response = await fetch('/api/v1/admin/usage-policy', {
      method, headers: {'content-type':'application/json','x-snaap-client':'web'},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'บันทึกไม่สำเร็จ');
    return data;
  }
  function view() {
    const unified = form.elements.mode.value === 'unified';
    document.querySelector('#usage-profile-tabs').hidden = unified;
    document.querySelector('#usage-policy-mode-help').textContent = unified ? 'กติกากลางใช้กับทุกบัญชี โดยไม่ตรวจ FREE / PRO' : 'กำหนดกติกาแต่ละแพ็กเกจแยกกัน';
    form.querySelectorAll('[data-policy-profile]').forEach(panel => panel.hidden = panel.dataset.policyProfile !== (unified ? 'unified' : selected));
    form.querySelectorAll('[data-edit-profile]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.editProfile === selected)));
  }
  function paint(data) {
    current = data;
    form.elements.mode.value = data.mode;
    for (const profile of profiles) for (const key of keys) form.elements[`${profile}.${key}`].value = data[profile][key] ?? '';
    form.elements.lineTotal.value = data.lineTotal ?? '';
    for (const feature of ['ai','automation','notifications']) form.elements[`services.${feature}`].checked = data.services[feature];
    form.elements.requestsPerMinute.value = data.requestsPerMinute;
    view();
  }
  async function load() {
    if (busy) return;
    busy = true; save.disabled = true; reload.disabled = true;
    status.textContent = 'กำลังโหลด…';
    try { paint(await request()); status.textContent = 'ค่าปัจจุบัน'; }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; save.disabled = !current; reload.disabled = false; }
  }
  form.elements.mode.addEventListener('change', view);
  form.querySelectorAll('[data-edit-profile]').forEach(button => button.addEventListener('click',()=>{selected=button.dataset.editProfile;view();}));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !current || !form.reportValidity()) return;
    const {revision, ...policy} = current;
    policy.mode = form.elements.mode.value;
    for (const profile of profiles) {
      policy[profile] = {...policy[profile]};
      for (const key of keys) {
        const raw = form.elements[`${profile}.${key}`].value.trim();
        policy[profile][key] = raw === '' ? null : Number(raw);
      }
    }
    policy.lineTotal = form.elements.lineTotal.value.trim() === '' ? null : Number(form.elements.lineTotal.value);
    policy.services = Object.fromEntries(['ai','automation','notifications'].map(feature=>[feature,form.elements[`services.${feature}`].checked]));
    policy.requestsPerMinute = Number(form.elements.requestsPerMinute.value);
    busy = true; save.disabled = true; reload.disabled = true;
    status.textContent = 'กำลังบันทึก…';
    try { paint(await request('POST',{policy,expectedRevision:revision})); status.textContent = 'บันทึกแล้ว · ใช้ในรอบถัดไป'; }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; save.disabled = false; reload.disabled = false; }
  });
  document.querySelector('[data-tab="usage-policy"]').addEventListener('click', () => { if (!current) load(); });
  reload.addEventListener('click', load);
})();

(() => {
  const dialog=document.querySelector('#restriction-dialog');
  const form=document.querySelector('#restriction-form');
  const status=document.querySelector('#restriction-status');
  const submit=form.querySelector('[type="submit"]');
  const scopes={none:'ใช้งานได้',all:'ระงับทั้งหมด',ai:'พัก AI',automation:'พักการเฝ้าติดตาม',notifications:'พักแจ้งเตือน'};
  let target,revision,busy=false;
  const endpoint=()=>`/api/v1/admin/users/${encodeURIComponent(target.dataset.user)}/restriction`;
  document.querySelector('#users-tbody').addEventListener('click',async event=>{
    const button=event.target.closest('[data-action="restriction"]');
    if(!button || busy)return;
    target=button;busy=true;submit.disabled=true;form.reset();form.elements.duration.disabled=false;
    document.querySelector('#restriction-user').textContent=button.dataset.email;
    document.querySelector('#restriction-current').textContent='';
    status.textContent='กำลังโหลด…';dialog.showModal();
    try {
      const response=await fetch(endpoint());const data=await response.json();
      if(!response.ok)throw new Error(data.error?.message || 'โหลดสถานะไม่สำเร็จ');
      revision=data.revision;
      document.querySelector('#restriction-current').textContent=`สถานะ: ${data.active ? scopes[data.scope] : 'ใช้งานได้'}${data.active && data.until_at ? ' · ถึง '+new Date(data.until_at).toLocaleString('th-TH') : ''}${data.reason ? ' · เหตุผลล่าสุด: '+data.reason : ''}`;
      form.elements.scope.value=data.active ? data.scope : 'all';
      status.textContent='';submit.disabled=false;
    }catch(error){status.textContent=error.message;}finally{busy=false;}
  });
  form.elements.scope.addEventListener('change',()=>{form.elements.duration.disabled=form.elements.scope.value==='none';});
  dialog.querySelector('[data-restriction-close]').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !form.reportValidity())return;
    busy=true;submit.disabled=true;status.textContent='กำลังบันทึก…';
    try {
      const response=await fetch(endpoint(),{method:'POST',headers:{'content-type':'application/json','x-snaap-client':'web'},body:JSON.stringify({scope:form.elements.scope.value,durationMinutes:form.elements.duration.value===''?null:Number(form.elements.duration.value),reason:form.elements.reason.value,expectedRevision:revision})});
      const data=await response.json();if(!response.ok)throw new Error(data.error?.message || 'บันทึกไม่สำเร็จ');
      revision=data.revision;target.textContent=data.active?'⏸ ระงับอยู่':'ควบคุม';
      document.querySelector('#restriction-current').textContent='สถานะ: '+scopes[data.scope];
      status.textContent='บันทึกแล้ว · มีประวัติใน Logs';
    }catch(error){status.textContent=error.message;}finally{busy=false;submit.disabled=false;}
  });
})();

(() => {
  const tbody = document.querySelector('#users-tbody');
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = value => Number(value ?? 0).toLocaleString();
  async function report(button, row, cursor) {
    button.disabled = true;
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(button.dataset.user)}/usage${cursor ? '?before='+encodeURIComponent(cursor) : ''}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'โหลดไม่สำเร็จ');
      if (!row.isConnected) return;
      const t=data.totals;
      if (!cursor) row.innerHTML = `<td colspan="6"><div class="usage-report"><div class="usage-report-heading"><strong>การใช้งานสะสม</strong><span>AI = คำตอบสำเร็จ · แจ้งเตือน = ข้อความที่ส่งสำเร็จ</span></div><div class="usage-report-metrics">${[['AI',t.ai_completed],['แจ้งเตือน',t.notifications_sent],['เซ็ตอัพที่เปิด',t.active_setups],['สัญญาณ',t.signals],['เวิร์กสเปซ',t.workspaces]].map(([label,value])=>`<div><strong>${n(value)}</strong><span>${label}</span></div>`).join('')}</div><p class="usage-report-note">AI ล้มเหลว ${n(t.ai_failed)} · Tokens เข้า ${n(t.input_tokens)} / ออก ${n(t.output_tokens)} · ต้นทุนประมาณ $${Number(t.estimated_usd).toFixed(4)} · แจ้งเตือนล้มเหลว ${n(t.notifications_failed)} / รอส่ง ${n(t.notifications_pending)}</p><div class="table-container"><table class="admin-table usage-setup-table"><thead><tr><th>เซ็ตอัพ</th><th>สถานะ</th><th>สัญญาณ</th><th>ส่งแจ้งเตือน</th></tr></thead><tbody data-report-setups></tbody></table></div><button class="btn btn-sm" data-report-more hidden>โหลดเซ็ตอัพเพิ่ม</button></div></td>`;
      row.querySelector('[data-report-setups]').insertAdjacentHTML('beforeend',data.setups.map(setup=>`<tr><td>${esc(setup.name)}</td><td>${setup.deleted ? 'ลบแล้ว' : setup.active ? 'เปิดอยู่' : 'หยุด'}</td><td>${n(setup.signals)}</td><td>${n(setup.notifications_sent)}</td></tr>`).join('') || '<tr><td colspan="4">ยังไม่มีเซ็ตอัพ</td></tr>');
      const more=row.querySelector('[data-report-more]');more.hidden=!data.nextCursor;more.onclick=()=>report(button,row,data.nextCursor);
    } catch (error) { if(row.isConnected) row.innerHTML=`<td colspan="6" role="alert">${esc(error.message)} <button class="btn btn-sm" data-report-retry>ลองใหม่</button></td>`;row.querySelector('[data-report-retry]')?.addEventListener('click',()=>report(button,row)); }
    finally {button.disabled=false;}
  }
  tbody.addEventListener('click',event=>{
    const button=event.target.closest('[data-action="usage-report"]');if(!button)return;
    const parent=button.closest('tr');
    if(parent.nextElementSibling?.dataset.usageFor===button.dataset.user){parent.nextElementSibling.remove();button.setAttribute('aria-expanded','false');return;}
    const row=document.createElement('tr');row.dataset.usageFor=button.dataset.user;row.innerHTML='<td colspan="6" role="status">กำลังโหลดการใช้งาน…</td>';parent.after(row);button.setAttribute('aria-expanded','true');report(button,row);
  });
})();
