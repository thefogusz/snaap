"use strict";
const status = document.querySelector("#login-status");
const button = document.querySelector("#google-login");
const retry = document.querySelector("#login-retry");
const reason = new URLSearchParams(location.search).get("error");
const errors = {
  admin_denied: "บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล กรุณาเลือกบัญชีที่ได้รับอนุญาต",
  not_configured: "ยังไม่ได้ตั้งค่า Google Login บนเซิร์ฟเวอร์",
  cancelled: "ยกเลิกการเข้าสู่ระบบแล้ว เลือกบัญชีใหม่ได้เลย",
  expired: "การเข้าสู่ระบบหมดอายุ กรุณาลองใหม่",
  failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
};
function message(text) {
  status.hidden = false;
  status.textContent = text;
  status.dataset.error = "";
}
if (reason) {
  history.replaceState(null, "", "/admin/login");
  message(errors[reason] || errors.failed);
}
async function prepare() {
  retry.hidden = true;
  button.removeAttribute("href");
  button.setAttribute("aria-disabled", "true");
  button.textContent = "กำลังตรวจสอบการเข้าสู่ระบบ…";
  try {
    const response = await fetch("/api/v1/health", {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error();
    const health = await response.json();
    button.textContent = "เข้าสู่ระบบผู้ดูแลด้วย Google";
    if (!health.google) {
      message(errors.not_configured);
      retry.hidden = false;
      return;
    }
    button.href = "/api/v1/auth/google?admin=1";
    button.removeAttribute("aria-disabled");
    if (!reason) status.hidden = true;
  } catch {
    button.textContent = "เข้าสู่ระบบผู้ดูแลด้วย Google";
    message("ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองเชื่อมต่อใหม่");
    retry.hidden = false;
  }
}
retry.addEventListener("click", prepare);
prepare();
