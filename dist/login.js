'use strict';
const loginStatus=document.querySelector('#login-status');
const errors={blocked:(globalThis.SnaapI18n?.text("บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อทีม SNAAP") ?? "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อทีม SNAAP"),not_configured:(globalThis.SnaapI18n?.text("ยังไม่ได้ตั้งค่า Google Login") ?? "ยังไม่ได้ตั้งค่า Google Login"),cancelled:(globalThis.SnaapI18n?.text("ยกเลิกการเข้าสู่ระบบแล้ว ลองใหม่ได้เลย") ?? "ยกเลิกการเข้าสู่ระบบแล้ว ลองใหม่ได้เลย"),expired:(globalThis.SnaapI18n?.text("การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง") ?? "การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"),failed:(globalThis.SnaapI18n?.text("เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง") ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง"),invite_required:(globalThis.SnaapI18n?.text("Snaap เปิดให้สมัครด้วย Google แล้ว กรุณาเข้าสู่ระบบอีกครั้ง") ?? "Snaap เปิดให้สมัครด้วย Google แล้ว กรุณาเข้าสู่ระบบอีกครั้ง")};
const reason=new URLSearchParams(location.search).get('error');
if(reason){history.replaceState(null,'','/login.html');loginStatus.hidden=false;loginStatus.textContent=errors[reason]??errors.failed;loginStatus.dataset.error='';}
async function prepareLogin(){
  try{
    const response=await fetch('/api/v1/health');if(!response.ok)throw Error();
    const health=await response.json();
    const googleButton=document.querySelector('#google-login');googleButton.hidden=false;
    if(!health.google){googleButton.removeAttribute('href');googleButton.setAttribute('aria-disabled','true');googleButton.title=(globalThis.SnaapI18n?.text("Google Login ยังไม่พร้อมใช้งาน") ?? "Google Login ยังไม่พร้อมใช้งาน");}
    document.querySelector('#local-access').hidden=!health.local;
    if(!reason)loginStatus.hidden=true;
    document.querySelector('#local-login').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        const result=await fetch('/api/v1/auth/local',{method:'POST',headers:{'x-snaap-client':'web','Content-Type':'application/json'},body:'{}'});
        if(!result.ok)throw Error();sessionStorage.removeItem('snaap-signed-out');location.replace('/home');
      }catch{loginStatus.hidden=false;loginStatus.textContent=(globalThis.SnaapI18n?.text("เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง") ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง");button.disabled=false;}
    };
  }catch{loginStatus.hidden=false;loginStatus.textContent=(globalThis.SnaapI18n?.text("ยังเชื่อมต่อ Snaap ไม่ได้ กรุณารีเฟรชเพื่อลองอีกครั้ง") ?? "ยังเชื่อมต่อ Snaap ไม่ได้ กรุณารีเฟรชเพื่อลองอีกครั้ง");}
}
prepareLogin();
