"use strict";
var notificationOverview = {
  deliveryGroups(rows) {
    const groups = new Map();
    for (const row of rows) {
      const id = row.destination_id ?? row.name;
      if (!groups.has(id))
        groups.set(id, {
          id,
          name: row.name,
          kind: row.kind,
          sent: 0,
          pending: 0,
          attention: 0,
          rows: [],
        });
      const group = groups.get(id);
      group.rows.push(row);
      if (row.status === "SENT") group.sent++;
      else if (["PENDING", "RETRY"].includes(row.status)) group.pending++;
      else group.attention++;
    }
    const priority = (row) =>
      row.status === "SENT"
        ? 2
        : ["PENDING", "RETRY"].includes(row.status)
          ? 1
          : 0;
    for (const group of groups.values())
      group.rows.sort((a, b) => priority(a) - priority(b));
    return [...groups.values()].sort(
      (a, b) => b.attention - a.attention || b.pending - a.pending,
    );
  },
  lifecycleLabel(state) {
    if (state.active) return (globalThis.SnaapI18n?.text("มีสัญญาณเข้าแล้ว") ?? "มีสัญญาณเข้าแล้ว");
    if (state.cooldownUntil > state.lastTime) return (globalThis.SnaapI18n?.text("พักก่อนตรวจรอบถัดไป") ?? "พักก่อนตรวจรอบถัดไป");
    if (state.stage >= 0) return `${(globalThis.SnaapI18n?.text("รอยืนยันขั้นที่ ") ?? "รอยืนยันขั้นที่ ")}${state.stage + 1}`;
    if (state.latched) return (globalThis.SnaapI18n?.text("รอเงื่อนไขรอบใหม่") ?? "รอเงื่อนไขรอบใหม่");
    return (globalThis.SnaapI18n?.text("รอเงื่อนไขเข้า") ?? "รอเงื่อนไขเข้า");
  },
  marketSummary(row) {
    const statuses = {
      PAUSED: [(globalThis.SnaapI18n?.text("พักการติดตาม") ?? "พักการติดตาม"), (globalThis.SnaapI18n?.text("เปิดติดตามได้ในแท็บเซตอัป") ?? "เปิดติดตามได้ในแท็บเซตอัป"), false],
      ADMIN_PAUSED: [(globalThis.SnaapI18n?.text("ผู้ดูแลพักการติดตาม") ?? "ผู้ดูแลพักการติดตาม"), (globalThis.SnaapI18n?.text("รอคืนสิทธิ์หรือสิ้นสุดระยะเวลาที่ผู้ดูแลกำหนด") ?? "รอคืนสิทธิ์หรือสิ้นสุดระยะเวลาที่ผู้ดูแลกำหนด"), false],
      QUOTA_BLOCKED: [
        (globalThis.SnaapI18n?.text("เกินจำนวนที่ติดตามได้") ?? "เกินจำนวนที่ติดตามได้"),
        (globalThis.SnaapI18n?.text("ลดจำนวนเซตอัปที่เปิดไว้ หรือเปลี่ยนแพ็กเกจ") ?? "ลดจำนวนเซตอัปที่เปิดไว้ หรือเปลี่ยนแพ็กเกจ"),
        true,
      ],
      DIRECTION_REQUIRED: [
        (globalThis.SnaapI18n?.text("ยังไม่ได้เลือกฝั่ง") ?? "ยังไม่ได้เลือกฝั่ง"),
        (globalThis.SnaapI18n?.text("เลือก Long หรือ Short ในเซตอัปนี้") ?? "เลือก Long หรือ Short ในเซตอัปนี้"),
        true,
      ],
      DATA_UNAVAILABLE: [
        (globalThis.SnaapI18n?.text("ข้อมูลตลาดไม่พร้อม") ?? "ข้อมูลตลาดไม่พร้อม"),
        (globalThis.SnaapI18n?.text("ระบบจะลองเชื่อมต่อใหม่ ยังตรวจสัญญาณไม่ได้") ?? "ระบบจะลองเชื่อมต่อใหม่ ยังตรวจสัญญาณไม่ได้"),
        true,
      ],
      RECOVERING: [(globalThis.SnaapI18n?.text("กำลังกู้คืนข้อมูล") ?? "กำลังกู้คืนข้อมูล"), (globalThis.SnaapI18n?.text("ระบบกำลังอัปเดตข้อมูลตลาดให้ทันล่าสุด") ?? "ระบบกำลังอัปเดตข้อมูลตลาดให้ทันล่าสุด"), false],
      DELAYED: [(globalThis.SnaapI18n?.text("ข้อมูลล่าช้า") ?? "ข้อมูลล่าช้า"), (globalThis.SnaapI18n?.text("รอข้อมูลตลาดรอบใหม่ก่อนตรวจสัญญาณ") ?? "รอข้อมูลตลาดรอบใหม่ก่อนตรวจสัญญาณ"), true],
      INSUFFICIENT: [(globalThis.SnaapI18n?.text("ข้อมูลยังไม่ครบ") ?? "ข้อมูลยังไม่ครบ"), (globalThis.SnaapI18n?.text("รอข้อมูลให้ครบก่อนตรวจสัญญาณ") ?? "รอข้อมูลให้ครบก่อนตรวจสัญญาณ"), true],
    };
    if (!["READY", "CURRENT"].includes(row.status)) {
      const [label, detail, attention] = statuses[row.status] ?? [
        (globalThis.SnaapI18n?.text("ยังตรวจไม่ได้") ?? "ยังตรวจไม่ได้"),
        (globalThis.SnaapI18n?.text("ตรวจการตั้งค่าเซตอัปและการเชื่อมต่อ") ?? "ตรวจการตั้งค่าเซตอัปและการเชื่อมต่อ"),
        true,
      ];
      return { label, detail, attention };
    }
    const state = row.state;
    const label = !state
      ? (globalThis.SnaapI18n?.text("ข้อมูลพร้อม") ?? "ข้อมูลพร้อม")
      : state.sides
        ? `Long: ${this.lifecycleLabel(state.sides.long)} · Short: ${this.lifecycleLabel(state.sides.short)}`
        : this.lifecycleLabel(state);
    return {
      label,
      detail: (globalThis.SnaapI18n?.text("ระบบติดตามอยู่ · เมื่อเกิดสัญญาณ ดูได้ในแท็บสัญญาณ") ?? "ระบบติดตามอยู่ · เมื่อเกิดสัญญาณ ดูได้ในแท็บสัญญาณ"),
      attention: false,
    };
  },
};
