// Coordinates are normalized to the server's private, re-encoded image, never the original file.
function selectImageRegion(image) {
  const dialog = document.createElement("dialog");
  dialog.className = "runtime-dialog crop-dialog";
  dialog.innerHTML = `<h2>เลือกบริเวณที่ต้องการถาม</h2><p>ลากบนภาพเพื่อเลือก หรือใช้ทั้งภาพ</p><div class="crop-stage"><img alt="ภาพที่แนบ"><div class="crop-box" hidden></div></div><p class="crop-status" role="status">ใช้ทั้งภาพ</p><div class="design-actions"><button class="primary" data-use>ใช้บริเวณนี้</button><button class="secondary" data-whole>ใช้ทั้งภาพ</button><button class="text-button" data-cancel>ยกเลิก</button></div>`;
  const img = dialog.querySelector("img"),
    stage = dialog.querySelector(".crop-stage"),
    box = dialog.querySelector(".crop-box");
  img.src = image.url;
  let start = null,
    region = null;
  const point = (e) => {
    const r = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
      y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
      r,
    };
  };
  stage.onpointerdown = (e) => {
    start = point(e);
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  stage.onpointermove = (e) => {
    if (!start) return;
    const end = point(e),
      left = Math.min(start.x, end.x),
      top = Math.min(start.y, end.y),
      width = Math.abs(end.x - start.x),
      height = Math.abs(end.y - start.y);
    box.hidden = false;
    Object.assign(box.style, {
      left: left + "px",
      top: top + "px",
      width: width + "px",
      height: height + "px",
    });
    const sx = image.width / end.r.width,
      sy = image.height / end.r.height;
    region = {
      left: Math.floor(left * sx),
      top: Math.floor(top * sy),
      width: Math.floor(width * sx),
      height: Math.floor(height * sy),
    };
    dialog.querySelector(".crop-status").textContent =
      `เลือก ${region.width} × ${region.height} พิกเซล`;
  };
  stage.onpointerup = () => {
    start = null;
  };
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) => {
    let result = undefined;
    dialog.querySelector("[data-use]").onclick = () => {
      if (!region || region.width < 5 || region.height < 5) return;
      result = region;
      dialog.close();
    };
    dialog.querySelector("[data-whole]").onclick = () => {
      result = null;
      dialog.close();
    };
    dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
    dialog.onclose = () => {
      dialog.remove();
      resolve(result);
    };
  });
}
