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
    if (state.active) return "มีสัญญาณเข้าแล้ว";
    if (state.cooldownUntil > state.lastTime) return "พักก่อนตรวจรอบถัดไป";
    if (state.stage >= 0) return `รอยืนยันขั้นที่ ${state.stage + 1}`;
    if (state.latched) return "รอเงื่อนไขรอบใหม่";
    return "รอเงื่อนไขเข้า";
  },
  marketSummary(row) {
    const statuses = {
      PAUSED: ["พักการติดตาม", "เปิดติดตามได้ในแท็บเซตอัป", false],
      ADMIN_PAUSED: ["ผู้ดูแลพักการติดตาม", "รอคืนสิทธิ์หรือสิ้นสุดระยะเวลาที่ผู้ดูแลกำหนด", false],
      QUOTA_BLOCKED: [
        "เกินจำนวนที่ติดตามได้",
        "ลดจำนวนเซตอัปที่เปิดไว้ หรือเปลี่ยนแพ็กเกจ",
        true,
      ],
      DIRECTION_REQUIRED: [
        "ยังไม่ได้เลือกฝั่ง",
        "เลือก Long หรือ Short ในเซตอัปนี้",
        true,
      ],
      DATA_UNAVAILABLE: [
        "ข้อมูลตลาดไม่พร้อม",
        "ระบบจะลองเชื่อมต่อใหม่ ยังตรวจสัญญาณไม่ได้",
        true,
      ],
      RECOVERING: ["กำลังกู้คืนข้อมูล", "ระบบกำลังอัปเดตข้อมูลตลาดให้ทันล่าสุด", false],
      DELAYED: ["ข้อมูลล่าช้า", "รอข้อมูลตลาดรอบใหม่ก่อนตรวจสัญญาณ", true],
      INSUFFICIENT: ["ข้อมูลยังไม่ครบ", "รอข้อมูลให้ครบก่อนตรวจสัญญาณ", true],
    };
    if (!["READY", "CURRENT"].includes(row.status)) {
      const [label, detail, attention] = statuses[row.status] ?? [
        "ยังตรวจไม่ได้",
        "ตรวจการตั้งค่าเซตอัปและการเชื่อมต่อ",
        true,
      ];
      return { label, detail, attention };
    }
    const state = row.state;
    const label = !state
      ? "ข้อมูลพร้อม"
      : state.sides
        ? `Long: ${this.lifecycleLabel(state.sides.long)} · Short: ${this.lifecycleLabel(state.sides.short)}`
        : this.lifecycleLabel(state);
    return {
      label,
      detail: "ระบบติดตามอยู่ · เมื่อเกิดสัญญาณ ดูได้ในแท็บสัญญาณ",
      attention: false,
    };
  },
};
