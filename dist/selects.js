(() => {
  let sequence = 0,
    opened = null,
    scheduled = false;
  const controls = new WeakMap();
  const labelFor = (select) =>
    select.getAttribute("aria-label") ||
    [...(select.labels || [])]
      .map((label) =>
        [...label.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join(" ")
          .trim(),
      )
      .filter(Boolean)
      .join(" ") ||
    "เลือกค่า";
  function close() {
    if (!opened) return;
    opened.trigger.setAttribute("aria-expanded", "false");
    opened.trigger.removeAttribute("aria-activedescendant");
    opened.trigger.removeAttribute("aria-controls");
    opened.menu.remove();
    opened = null;
  }
  function enhance(select) {
    if (
      select.hidden ||
      select.hasAttribute("data-native") ||
      select.classList.contains("conversation-select") ||
      select.multiple
    )
      return;
    let control = controls.get(select);
    if (!control) {
      const wrapper = document.createElement("span");
      wrapper.className = "snaap-select";
      select.before(wrapper);
      wrapper.append(select);
      select.classList.add("snaap-select-native");
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "snaap-select-trigger";
      trigger.setAttribute("role", "combobox");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.innerHTML =
        '<span class="snaap-select-value"></span><span class="snaap-select-chevron" aria-hidden="true"></span>';
      wrapper.append(trigger);
      control = { select, trigger, wrapper };
      controls.set(select, control);
      trigger.onclick = (event) => {
        event.preventDefault();
        opened?.select === select ? close() : open(control);
      };
      trigger.onkeydown = (event) => keyboard(event, control);
      select.addEventListener("change", () => sync(control));
      select.addEventListener("snaap-select-sync", () => sync(control));
    }
    sync(control);
  }
  function sync({ select, trigger }) {
    const text = select.selectedOptions[0]?.textContent || "เลือกค่า";
    const value = trigger.querySelector(".snaap-select-value");
    if (value.textContent !== text) value.textContent = text;
    const name = labelFor(select);
    if (trigger.getAttribute("aria-label") !== name)
      trigger.setAttribute("aria-label", name);
    if (trigger.disabled !== select.disabled) trigger.disabled = select.disabled;
  }
  const pendingSelects = new Set();
  function scan(selects = document.querySelectorAll("select")) {
    selects.forEach(select => { if (select.isConnected) enhance(select); });
    if (opened && !opened.select.isConnected) close();
  }
  function open(control) {
    close();
    if (control.select.disabled) return;
    const { select, trigger } = control;
    const menu = document.createElement("div");
    menu.className = "snaap-select-menu";
    menu.id = "select-list-" + ++sequence;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", labelFor(select));
    const searchable=select.options.length>40;
    let searchInput=null,list=menu;
    if(searchable){
      menu.removeAttribute('role');
      searchInput=document.createElement('input');
      searchInput.type='search';searchInput.className='snaap-select-search';
      searchInput.placeholder='ค้นหาอินดิเคเตอร์…';
      searchInput.setAttribute('aria-label','ค้นหาอินดิเคเตอร์');
      searchInput.setAttribute('role','combobox');searchInput.setAttribute('aria-expanded','true');
      list=document.createElement('div');list.id=menu.id+'-options';list.setAttribute('role','listbox');list.setAttribute('aria-label',labelFor(select));
      searchInput.setAttribute('aria-controls',list.id);menu.append(searchInput,list);
    }
    const items = [...select.options].map((option, index) => {
      const item = document.createElement("div");
      item.className = "snaap-select-option";
      item.id = menu.id + "-" + index;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      const disabled = option.disabled || option.parentElement?.disabled;
      item.setAttribute("aria-disabled", String(!!disabled));
      item.textContent = option.textContent;
      item.onpointerdown = (event) => event.preventDefault();
      item.onclick = () => {
        if (!disabled) commit(index);
      };
      list.append(item);
      return { item, disabled };
    });
    (trigger.closest("dialog") || document.body).append(menu);
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 200), innerWidth - 24);
    menu.style.width = width + "px";
    menu.style.left =
      Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + "px";
    const below = innerHeight - rect.bottom - 12,
      above = rect.top - 12;
    const height = Math.min(288, Math.max(below, above));
    menu.style.maxHeight = Math.max(80, height) + "px";
    if (below >= Math.min(menu.scrollHeight, 288) || below >= above)
      menu.style.top = rect.bottom + 6 + "px";
    else menu.style.bottom = innerHeight - rect.top + 6 + "px";
    opened = {
      ...control,
      menu,
      items,
      index: Math.max(0, select.selectedIndex),
      search: "",
      lastKey: 0,
      searchInput,
    };
    trigger.setAttribute("aria-controls", list.id);
    trigger.setAttribute("aria-expanded", "true");
    highlight(opened.index);
    if(searchInput){
      searchInput.oninput=()=>{
        const query=searchInput.value.trim().toLocaleLowerCase();
        items.forEach(({item})=>{item.hidden=!item.textContent.toLocaleLowerCase().includes(query);});
        const first=items.findIndex(x=>!x.disabled&&!x.item.hidden);
        highlight(first);
      };
      searchInput.onkeydown=event=>keyboard(event,control);
      searchInput.focus({preventScroll:true});
    }else trigger.focus({ preventScroll: true });
  }
  function highlight(index) {
    if (!opened) return;
    opened.index = index;
    opened.items.forEach(({ item }, i) =>
      item.classList.toggle("is-highlighted", i === index),
    );
    const item = opened.items[index]?.item;
    if (item) {
      opened.trigger.setAttribute("aria-activedescendant", item.id);
      opened.searchInput?.setAttribute('aria-activedescendant',item.id);
      item.scrollIntoView({ block: "nearest" });
    }else{opened.trigger.removeAttribute('aria-activedescendant');opened.searchInput?.removeAttribute('aria-activedescendant');}
  }
  function commit(index) {
    const { select, trigger } = opened;
    const changed = select.selectedIndex !== index;
    // Rendered rule controls may be replaced by the existing change handler.
    const keys = ["id", "data-path", "data-opkind", "name"];
    const key = keys.find((key) => select.hasAttribute(key));
    const value = key && select.getAttribute(key);
    select.selectedIndex = index;
    close();
    sync({ select, trigger });
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    scan();
    const replacement = select.isConnected
      ? select
      : [...document.querySelectorAll("select")].find(
          (el) => key && el.getAttribute(key) === value,
        );
    controls.get(replacement)?.trigger.focus({ preventScroll: true });
  }
  function keyboard(event, control) {
    const key = event.key;
    if (key === "Escape") {
      if (opened) {
        event.preventDefault();
        event.stopPropagation();
        close();
        control.trigger.focus({preventScroll:true});
      }
      return;
    }
    if (key === "Tab") {
      if(opened?.searchInput===event.target)control.trigger.focus({preventScroll:true});
      close();
      return;
    }
    const typing=opened?.searchInput===event.target;
    if (typing&&[' ','Home','End'].includes(key))return;
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) {
      event.preventDefault();
      if (!opened || opened.select !== control.select) {
        open(control);
        if (["Enter", " "].includes(key)) return;
      }
      if (["Enter", " "].includes(key)) {
        if (opened.items[opened.index]&&!opened.items[opened.index].disabled&&!opened.items[opened.index].item.hidden) commit(opened.index);
        return;
      }
      const eligible = opened.items
        .map((x, i) => (x.disabled||x.item.hidden ? -1 : i))
        .filter((i) => i >= 0);
      if (!eligible.length) return;
      const current = eligible.indexOf(opened.index);
      const next =
        key === "Home"
          ? eligible[0]
          : key === "End"
            ? eligible.at(-1)
            : eligible[
                (current + (key === "ArrowDown" ? 1 : -1) + eligible.length) %
                  eligible.length
              ];
      highlight(next);
      return;
    }
    if (!typing&&key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!opened) open(control);
      opened.search =
        Date.now() - opened.lastKey > 700 ? key : opened.search + key;
      opened.lastKey = Date.now();
      const found = opened.items.findIndex(
        (x) =>
          !x.disabled &&
          x.item.textContent
            .toLocaleLowerCase()
            .startsWith(opened.search.toLocaleLowerCase()),
      );
      if (found >= 0) highlight(found);
    }
  }
  document.addEventListener("pointerdown", (event) => {
    if (
      opened &&
      !opened.menu.contains(event.target) &&
      !opened.wrapper.contains(event.target)
    )
      close();
  });
  addEventListener("resize", close);
  document.addEventListener(
    "scroll",
    (event) => {
      if (opened && !opened.menu.contains(event.target)) close();
    },
    true,
  );
  new MutationObserver((records) => {
    for (const record of records) {
      const select = record.target.closest?.("select");
      if (select) pendingSelects.add(select);
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches("select")) pendingSelects.add(node);
        node.querySelectorAll("select").forEach(select => pendingSelects.add(select));
      }
    }
    if (!pendingSelects.size && (!opened || opened.select.isConnected)) return;
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const selects = new Set(pendingSelects);
        pendingSelects.clear();
        scan(selects);
      });
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "selected"],
  });
  scan();
})();
