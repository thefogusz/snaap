let viewer;
let previousOverflow;
let trigger;

export function openChatImage(src, name, opener) {
  if (!viewer) {
    viewer = document.createElement('dialog');
    viewer.className = 'chat-image-viewer';
    viewer.setAttribute('aria-label', (globalThis.SnaapI18n?.text("ดูภาพเต็ม") ?? "ดูภาพเต็ม"));
    viewer.innerHTML = (globalThis.SnaapI18n?.text("<button type=\"button\" class=\"chat-image-close\" aria-label=\"ปิดภาพเต็ม\"><span aria-hidden=\"true\">×</span></button><img class=\"chat-image-full\" alt=\"\"><span class=\"chat-image-caption\"></span>") ?? "<button type=\"button\" class=\"chat-image-close\" aria-label=\"ปิดภาพเต็ม\"><span aria-hidden=\"true\">×</span></button><img class=\"chat-image-full\" alt=\"\"><span class=\"chat-image-caption\"></span>");
    document.body.append(viewer);
    const close = viewer.querySelector('button');
    const image = viewer.querySelector('img');
    close.addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', event => {
      if (event.target !== image && !close.contains(event.target)) viewer.close();
    });
    viewer.addEventListener('close', () => {
      document.body.style.overflow = previousOverflow;
      image.removeAttribute('src');
      if (trigger?.isConnected) trigger.focus({preventScroll:true});
      trigger = null;
    });
  }
  viewer.querySelector('img').src = src;
  viewer.querySelector('img').alt = name;
  viewer.querySelector('.chat-image-caption').textContent = name;
  trigger = opener;
  if (!viewer.open) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    viewer.showModal();
  }
}
