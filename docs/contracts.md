# สัญญาข้อมูลและ API

Design contract v1 · ยังไม่ใช่ endpoint ที่เปิดใช้งานแล้ว

## 1. Conventions

JSON camelCase, enum UPPER_SNAKE, timestamp ISO-8601 UTC, ID opaque string, monetary values decimal strings, indicator values finite numbers. Server derives workspace/user from authenticated session ไม่รับ ownerId จาก client เพื่อเลือกเจ้าของข้อมูล

Unknown enum ต้องแสดง fallback ที่ปลอดภัย ไม่ทำเป็น ACTIVE; validation ใช้ schemas เดียวทั้ง API และ draft editor Generated OpenAPI/types เป็นงาน implementation ไม่อ้างว่าไฟล์นี้เป็น runtime validator

## 2. RuleSpec v1

```ts
type Exchange = 'BINANCE' | 'BYBIT' | 'OKX' | 'BITGET' | 'MEXC';
type MarketType = 'SPOT' | 'LINEAR_PERPETUAL';
type Timeframe = '15m' | '1h' | '4h' | '1d';
type Operand =
  | { kind: 'PRICE'; field: 'CLOSE' }
  | { kind: 'INDICATOR'; name: 'EMA' | 'SMA' | 'RSI'; period: number; source: 'CLOSE' }
  | { kind: 'VOLUME_RATIO'; lookback: number; baseline: 'PREVIOUS_CLOSED'; unit: 'BASE' }
  | { kind: 'CONSTANT'; value: number };
type Condition =
  | { kind: 'COMPARE'; op: 'GT' | 'GTE' | 'LT' | 'LTE'; left: Operand; right: Operand }
  | { kind: 'GROUP'; op: 'AND' | 'OR'; children: Condition[] };
type Trigger =
  | { kind: 'CROSS'; direction: 'ABOVE' | 'BELOW'; left: Operand; right: Operand }
  | { kind: 'CONDITION_ENTER'; condition: Condition };
interface RuleSpec {
  schemaVersion: 1;
  name: string;
  targets: Array<{ exchange: Exchange; marketType: MarketType; instrumentIds: string[] }>;
  timeframe: Timeframe;
  priceSource: 'LAST_TRADE';
  evaluationMode: 'CLOSED_CANDLE';
  trigger: Trigger;
  filters: Condition;
  notification: {
    destinationIds: string[];
    initialSnapshot: boolean;
    cooldownSeconds: number;
    maxAgeSeconds: number;
  };
}
```

Core v1 contract ใช้ explicit instruments ที่ผ่าน catalogue; scanner เป็น resource แยก เก็บ `universeRevision → resolved instrument IDs` แล้ว compile ลง RuleSpec + evidence metadata ไม่ยัด wildcard ลง instrumentIds

targets ไม่เกิน 5 กระดาน, instrument ไม่ซ้ำ, period 2–1000, RSI threshold 0–100, constant finite, cooldown ≥0, maxAge >0; ตรวจกฎ depth/node budget และความเข้ากันของ units ด้วย semantic validator ไม่ใช่ JSON shape อย่างเดียว

`LINEAR_PERPETUAL` ต้อง resolve settlement/contract metadata ถูกต้องก่อน compile; ถ้า volume BASE หาไม่ได้ ห้ามแทน contract count โดยไม่ normalize ใน adapter

condition CROSS เปรียบเทียบ previous และ current ของทั้ง left/right; เช่น RSI crosses 30: previousRSI ≤30 และ currentRSI >30 หลังตรวจ filters ณ current bar. ตัวอย่าง [rule.json](examples/rule.json) เป็นข้อมูลสมมติ instrument IDs ไม่ใช่ catalogue ที่มีจริงในระบบปัจจุบัน

เพิ่ม intrabar/multi-timeframe ใน schemaVersion ใหม่เมื่อพร้อม อย่าเพิ่ม enum แล้วอ้าง implementation เดิมรองรับ

## 3. Domain records

| Entity | Key fields / invariants |
|---|---|
| Workspace | id, ownerUserId, timezone, runtimeMode |
| Conversation / Message | workspaceId, role, content, createdAt, source refs; streamed partial ≠ committed message |
| Rule / RuleRevision | workspaceId, activeRevisionId, controlEpoch, lifecycle; immutable spec/hash/confirmedBy/confirmedAt |
| RuleDraft | expectedRevision, spec, missingFields, provenance, compilerVersion; ไม่มี activation permission |
| Universe / Revision | filter definition, members, resolvedAt, effectiveAt, exclusions, pinned |
| Instrument | exchange, nativeSymbol, marketType, base/quote/settle, contractSize, status, capabilityVersion |
| Candle / CandleRevision | identity ตาม architecture, decimal OHLCV, finality, source, revisions, quality |
| EvaluationCheckpoint | ruleRevisionId+instrumentId, last processed candle/revision, previous state, latch, engineVersion |
| Signal | unique dedupKey, ruleRevisionId, instrumentId, kind, evidence, marketTime, evaluatedAt, universeRevision |
| Destination | workspaceId, channel, encrypted routing reference, verifiedAt, state; ไม่มี plaintext token ใน API response |
| Outbox / Delivery / Attempt | signal+destination+template unique, state, providerReceipt, attempt timestamps, redacted error |
| ExchangeConnection | workspaceId, account fingerprint, encrypted credential ref, permission evidence, sync cursor |
| Import / RawFill / NormalizedFill | provenance, external ID/fingerprint, timezone, fee/funding facts, completeness |
| PositionGroup / AnalysisRun | groupingVersion, fill membership, metrics, cost-basis quality, market-data version |
| Observation / Preference | inferred vs explicit, source refs, sample size, user disposition, invalidatedAt |
| AuditEvent | actor, action, resource revision, time, redacted delta, traceId |

สำคัญ: rule lifecycle, market health และ delivery state เก็บคนละ field; ไม่รวมเป็น status ตัวเดียว

## 4. API catalogue

Prefix `/api/v1`; list ทุก endpoint ใช้ `cursor` opaque และ `limit` 1–100 default20 ส่ง `{data:[], nextCursor:null|string}` detail ส่ง `{data:{...}}`; timestamps sort แบบ stable `(createdAt,id)`

| Method / path | Request | Response / result |
|---|---|---|
| GET /session | cookie | user/workspace/runtime capabilities ไม่มี secret |
| GET /instruments | exchange,marketType,query,cursor | Instrument[] เฉพาะ verified capability |
| GET /capabilities | exchange optional | capability records + verifiedAt |
| GET /conversations | cursor | Conversation[] |
| POST /conversations | `{title?:string}` | 201 Conversation |
| GET /conversations/:id/messages | cursor | Message[] |
| POST /conversations/:id/messages | `{content,clientMessageId}` | 202 `{messageId,jobId}`; SSE stream แยก job progress |
| GET /jobs/:id | — | `{state,progress,resultRef,error}` |
| POST /rule-drafts | `{spec,sourceConversationId?:string}` | 201 `{id,spec,validation,hash}` |
| PATCH /rule-drafts/:id | `{spec,expectedVersion}` | updated draft หรือ409 |
| POST /rule-previews | `{draftId}` | 200 readable clauses, target count, data readiness, confirmationHash, expiry |
| POST /rules | `{draftId,confirmationHash,mode:'DRAFT'|'ACTIVATE'}` | 201 Rule; ACTIVATE อาจเป็นWARMING ไม่ใช่ACTIVEทันที |
| GET /rules | lifecycle,cursor | Rule[] + per-target health summary |
| GET /rules/:id | — | Rule detail + active revision |
| POST /rules/:id/revisions | `{draftId,confirmationHash,expectedRevision}` | 201 immutable revision + activation boundary |
| PATCH /rules/:id | `{lifecycle:'PAUSED'|'WARMING'|'ARCHIVED',expectedRevision}` | updated rule/controlEpoch; no direct ACTIVE write |
| GET /rules/:id/evaluations | cursor | evaluations+evidence/unknown reasons |
| GET /signals | ruleId,instrumentId,cursor | Signal[] includes recovered/suppressed classification |
| GET /signals/:id | — | immutable evidence + deliveries |
| GET /destinations | cursor | masked destination list |
| POST /destination-links | `{channel,returnPath}` | one-time authenticated linking flow URL, expiresAt |
| POST /destination-tests | `{destinationId}` | 202 jobId; marked TEST |
| PATCH /destinations/:id | `{isEnabled,quietHours?,digest?}` | updated preferences |
| DELETE /destinations/:id | — | 204 disconnect, queued jobs invalidated |
| GET /deliveries | state,cursor | delivery list incl UNKNOWN |
| POST /deliveries/:id/retries | `{expectedState}` | 202 redrive with original idempotency key |
| POST /imports | multipart/file metadata | 202 importId+jobId; bytes private |
| GET /imports/:id | — | preview, rows summary, coverage, errors |
| POST /imports/:id/confirmations | `{mapping,timezone,expectedVersion}` | 202 processing job |
| GET /fills | accountId,range,cursor | normalized fills |
| POST /analysis-runs | `{accountIds,range,groupingPolicy}` | 202 run+job |
| GET /analysis-runs/:id | — | metrics, coverage, observations refs |
| POST /observations/:id/feedback | `{disposition}` | saved explicit user feedback |
| POST /exports | `{scope,format}` | 202 private expiring download job |
| POST /deletion-requests | `{scope,resourceIds,confirmation}` | 202 tracked deletion; ownership rechecked |
| GET /health | authenticated | process/data-source health and last updates |

Private exchange-link creation/update requires a dedicated masked credential input UI and API validation contract per provider at implementation. Do not accept credentials through conversation endpoint. Universal `/connections` must not falsely promise all providers share same permission fields.

## 5. Error / concurrency / idempotency

```json
{
  "error": {
    "code": "UNSUPPORTED_INSTRUMENT",
    "message": "ไม่พบคู่นี้ใน Bybit Spot",
    "fieldErrors": [{"path":"targets.0.instrumentIds","code":"NOT_AVAILABLE"}],
    "retryable": false,
    "traceId": "opaque-trace-id"
  }
}
```

400 malformed; 401 login; 403 permission; 404 missing or not-owned resource; 409 revision conflict/idempotency mismatch; 422 semantic validation; 429 quota with retry metadata; 503 unavailable. ไม่คืน stack/secret/provider raw response

Creation and action POST support `Idempotency-Key` scoped workspace+route+body hash; proposed retention24h. Same key+same input replays result, different input→409. Business unique keys in DB remain after API key expiry; otherwise replay after 24h could duplicate signals.

PATCH uses expectedRevision/If-Match; conflict returns current revision plus safe diff summary. Activation confirmation hash covers entire compiled rule+resolved targets+notification policy and expires if draft/catalogue membership changes materially.

SSE notification only tells clients to fetch authoritative committed records; reconnect with Last-Event-ID when retained, else resync snapshot. Client event duplication does not append duplicate cards/messages.

## 6. Event examples

```ts
type MarketHealth = 'HEALTHY' | 'RECONNECTING' | 'STALE' | 'GAP' | 'UNSUPPORTED';
type RuleLifecycle = 'DRAFT' | 'WARMING' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
type DeliveryState = 'QUEUED' | 'SENDING' | 'ACCEPTED' | 'RETRY_WAIT'
  | 'UNKNOWN' | 'FAILED' | 'EXPIRED' | 'SUPPRESSED' | 'CANCELLED';
interface SignalCreated {
  eventId: string;
  type: 'SIGNAL_CREATED';
  version: 1;
  signalId: string;
  workspaceId: string;
  ruleRevisionId: string;
  instrumentId: string;
  marketTime: string;
  emittedAt: string;
  kind: 'LIVE' | 'RECOVERED' | 'INITIAL_SNAPSHOT';
}
```

Internal event contract does not expose workspaceId in outbound webhook if not needed; outbound event has public signal ID and minimal evidence, no account trade history. Templates render from signal evidence and obey channel length/escaping requirements.
