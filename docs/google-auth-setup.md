# ตั้งค่า Google Login สำหรับ Snaap

## 1. สร้าง Google OAuth Client

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) แล้วสร้างหรือเลือกโปรเจกต์ Snaap
2. ไปที่ **Google Auth Platform** → **Branding** ตั้งชื่อแอป `Snaap` และอีเมลติดต่อ
3. ใน **Audience** เลือก External แล้ว Publish app เป็น **In production** สำหรับเว็บจริง Snaap ขอเฉพาะสิทธิ์พื้นฐาน `openid email` และไม่ต้องเพิ่มผู้ใช้ทีละอีเมล
4. ใน **Data Access** ใช้แค่ `openid` และ `https://www.googleapis.com/auth/userinfo.email` ไม่ต้องเพิ่ม Gmail, Drive หรือสิทธิ์อื่น
5. ใน **Clients** → **Create client** เลือก **Web application**
6. เพิ่ม **Authorized redirect URI** นี้ให้ตรงทุกตัวอักษร:

   ```text
   http://127.0.0.1:4173/api/v1/auth/google/callback
   ```

7. คัดลอก Client ID และ Client Secret ลง `.env` บนเครื่อง ห้ามใส่ Secret ในหน้าเว็บ แชท หรือ Git

ขั้นตอนและข้อกำหนด redirect URI อ้างอิง [เอกสาร OAuth สำหรับเว็บของ Google](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)

## 2. ตั้งค่า Snaap

แก้ไฟล์ `D:\SNAAP\.env` โดยคงค่าระบบอื่นไว้:

```dotenv
APP_ORIGIN=http://127.0.0.1:4173
GOOGLE_CLIENT_ID=ใส่-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=ใส่-client-secret
```

Snaap เปิดสมัครให้ทุกบัญชี Google ที่ยืนยันอีเมลแล้ว ระบบสร้างบัญชีแยกตาม Google subject ID โดยอัตโนมัติ ไม่ใช้ `INVITED_EMAILS` อีกต่อไป ค่าที่ค้างอยู่บนเซิร์ฟเวอร์ไม่มีผลต่อการเข้าสู่ระบบ

Google ยกเว้นข้อจำกัดรายชื่อ Test users สำหรับแอปที่ขอเฉพาะสิทธิ์พื้นฐาน `openid email profile` ตาม [เอกสาร Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) หากเพิ่มสิทธิ์อื่นในอนาคตต้องตรวจข้อกำหนดอีกครั้ง

หยุดแล้วเปิด `npm run dev` ใหม่ จากนั้นเปิด:

```text
http://127.0.0.1:4173/login.html
```

ก่อนเข้าใช้งานจะแสดงป๊อปอัปกลางจอแนะนำ Snaap กด **เข้าสู่ระบบด้วย Google** เลือกบัญชีแล้วกลับสู่หน้าแชท กดชื่อบัญชีในแถบซ้ายเพื่อเปิดเมนู **ออกจากระบบ**

หากยังไม่ได้ตั้งค่า Google ปุ่มจะแสดงแต่ยังใช้งานไม่ได้ ในโหมดพัฒนาบนเครื่องยังมีปุ่มบัญชีทดสอบแยกไว้ ไม่มีการเข้าสู่บัญชีทดสอบอัตโนมัติสำหรับผู้ที่ยังไม่ล็อกอิน

## 3. สิ่งที่ระบบทำ

- ขอเฉพาะ `openid email` เก็บ Google subject ID และอีเมลที่ยืนยันแล้ว ไม่เก็บรหัสผ่าน Google หรือ access/refresh token
- ใช้ Authorization Code + PKCE, state และ nonce ตรวจลายเซ็น ID token พร้อม issuer, audience และเวลาหมดอายุ
- ความพยายามล็อกอินหมดอายุใน 10 นาทีและใช้ callback ได้ครั้งเดียว
- เซสชัน Snaap เป็น cookie แบบ HttpOnly, SameSite=Lax อายุ 7 วัน ใช้ Secure เมื่อเว็บเป็น HTTPS เก็บเฉพาะ hash ของ session token ในฐานข้อมูล
- บัญชีผูกกับ Google `sub` ไม่รวมบัญชีโดยดูจากอีเมล อ้างอิง [OpenID Connect ของ Google](https://developers.google.com/identity/openid-connect/openid-connect)
- ข้อมูลของบัญชีทดสอบบนเครื่อง **ไม่ได้ย้าย** ไปบัญชี Google อัตโนมัติ บัญชี Google จะมีพื้นที่ของตัวเอง
- หลังล็อกอินด้วย Google โหมดพัฒนาจะไม่เปลี่ยนกลับเป็นบัญชีทดสอบอัตโนมัติ
- ปุ่มบัญชี / แพ็กเกจยังล็อก “เร็ว ๆ นี้” ตามเดิม

## 4. เมื่อเปิดเว็บจริง

ตั้ง `APP_ORIGIN` เป็นโดเมน HTTPS จริง เช่น `https://app.example.com` และเพิ่ม redirect URI `https://app.example.com/api/v1/auth/google/callback` ใน Google Client ของเว็บจริง ใช้ `npm start` พร้อม DATABASE_URL โหมดนี้ไม่มีปุ่มหรือเส้นทางบัญชีทดสอบที่ใช้งานได้

ตั้งหน้า consent พร้อมอีเมลติดต่อ โดเมน และนโยบายความเป็นส่วนตัวตามข้อกำหนด Google ก่อนเผยแพร่ การเปิดสมัครทั่วไปยังต้องผ่านการตรวจ Google ID token, PKCE, state และ nonce เหมือนเดิม

## แก้ปัญหาที่พบบ่อย

| ข้อความ | วิธีแก้ |
|---|---|
| Google Login ยังไม่พร้อม | ใส่ Client ID/Secret แล้วรีสตาร์ตเซิร์ฟเวอร์ |
| redirect_uri_mismatch | ตรวจ origin, port, path และ http/https ให้ตรงใน Google Console |
| บัญชียังไม่ได้รับเชิญจากเวอร์ชันเดิม | อัปเดตเซิร์ฟเวอร์เป็นเวอร์ชันเปิดสมัครทั่วไป แล้วเริ่มล็อกอินใหม่ |
| Google ปฏิเสธช่วง Testing | ตรวจว่า Audience เป็น External และขอแค่ `openid email`; หากเพิ่มสิทธิ์อื่น ให้ทำตามข้อกำหนด Test users / การเผยแพร่ของ Google |
| การเข้าสู่ระบบหมดอายุ | เริ่มใหม่จากหน้า login อย่าเปิด callback เดิมหรือสลับหลายแท็บพร้อมกัน |

## สถานะการส่งมอบ

Google Login ของเจ้าของระบบผ่านการตรวจบน production แล้วเมื่อ 4 ต.ค. 2569 เวอร์ชันเปิดสมัครทั่วไปเอาข้อจำกัดรายชื่ออีเมลออก โดยยังตรวจบัญชี Google ตามเดิม การตรวจตั้งค่าพร้อมจาก `/health` ไม่ใช่หลักฐานว่าบัญชีใหม่เข้าสู่ระบบสำเร็จ ต้องตรวจด้วยการล็อกอินจริงของผู้ใช้ใหม่
