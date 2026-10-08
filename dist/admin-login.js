"use strict";
const status = document.querySelector("#login-status");
const button = document.querySelector("#google-login");
const retry = document.querySelector("#login-retry");
const reason = new URLSearchParams(location.search).get("error");
const errors = {
  admin_denied: (globalThis.SnaapI18n?.text("บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล กรุณาเลือกบัญชีที่ได้รับอนุญาต") ?? "บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล กรุณาเลือกบัญชีที่ได้รับอนุญาต"),
  not_configured: (globalThis.SnaapI18n?.text("ยังไม่ได้ตั้งค่า Google Login บนเซิร์ฟเวอร์") ?? "ยังไม่ได้ตั้งค่า Google Login บนเซิร์ฟเวอร์"),
  cancelled: (globalThis.SnaapI18n?.text("ยกเลิกการเข้าสู่ระบบแล้ว เลือกบัญชีใหม่ได้เลย") ?? "ยกเลิกการเข้าสู่ระบบแล้ว เลือกบัญชีใหม่ได้เลย"),
  expired: (globalThis.SnaapI18n?.text("การเข้าสู่ระบบหมดอายุ กรุณาลองใหม่") ?? "การเข้าสู่ระบบหมดอายุ กรุณาลองใหม่"),
  failed: (globalThis.SnaapI18n?.text("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่") ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"),
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
  button.textContent = (globalThis.SnaapI18n?.text("กำลังตรวจสอบการเข้าสู่ระบบ…") ?? "กำลังตรวจสอบการเข้าสู่ระบบ…");
  try {
    const response = await fetch("/api/v1/health", {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error();
    const health = await response.json();
    button.textContent = (globalThis.SnaapI18n?.text("เข้าสู่ระบบผู้ดูแลด้วย Google") ?? "เข้าสู่ระบบผู้ดูแลด้วย Google");
    if (!health.google) {
      message(errors.not_configured);
      retry.hidden = false;
      return;
    }
    button.href = "/api/v1/auth/google?admin=1";
    button.removeAttribute("aria-disabled");
    if (!reason) status.hidden = true;
  } catch {
    button.textContent = (globalThis.SnaapI18n?.text("เข้าสู่ระบบผู้ดูแลด้วย Google") ?? "เข้าสู่ระบบผู้ดูแลด้วย Google");
    message((globalThis.SnaapI18n?.text("ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองเชื่อมต่อใหม่") ?? "ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองเชื่อมต่อใหม่"));
    retry.hidden = false;
  }
}
retry.addEventListener("click", prepare);
prepare();
