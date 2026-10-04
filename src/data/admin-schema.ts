import type pg from "pg";

/** Durable operational events are captured in the same transaction as their source. */
export async function migrateAdmin(db: pg.Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL UNIQUE,
      category text NOT NULL, severity text NOT NULL, title text NOT NULL, detail text NOT NULL,
      status text NOT NULL DEFAULT 'resolved', occurrences integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS admin_events_time ON admin_events(updated_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS admin_events_open ON admin_events(category) WHERE status='open';
    CREATE TABLE IF NOT EXISTS admin_event_receipts (
      event_id uuid REFERENCES admin_events ON DELETE CASCADE, admin_id uuid REFERENCES users ON DELETE CASCADE,
      seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_id,admin_id)
    );
    CREATE TABLE IF NOT EXISTS service_heartbeats (service text PRIMARY KEY, checked_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS admin_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users ON DELETE SET NULL,
      subject_id uuid REFERENCES users ON DELETE SET NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS manual_entitlements (
      owner_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE, pro_until timestamptz
    );
    CREATE TABLE IF NOT EXISTS admin_impersonations (
      session_hash text PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
      actor_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION capture_admin_event() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE k text; cat text; sev text; heading text; description text; state text := 'resolved';
      extra jsonb := '{}';
    BEGIN
      IF TG_TABLE_NAME='users' THEN
        IF NEW.email='local@snaap.invalid' THEN RETURN NEW; END IF;
        k := 'signup:' || NEW.id; cat := 'signup'; sev := 'info'; heading := 'มีผู้สมัครใหม่';
        description := COALESCE(NEW.email,NEW.id::text); extra := jsonb_build_object('userId',NEW.id);
      ELSIF TG_TABLE_NAME='billing_grants' THEN
        IF TG_OP='UPDATE' AND NEW.refunded IS NOT DISTINCT FROM OLD.refunded THEN RETURN NEW; END IF;
        k := 'billing:' || NEW.payment_id; cat := 'billing'; sev := CASE WHEN NEW.refunded THEN 'warning' ELSE 'success' END;
        heading := CASE WHEN NEW.refunded THEN 'คืนเงินแพ็กเกจ Pro' ELSE 'ได้รับการชำระเงิน Pro' END;
        description := (NEW.amount / 100.0)::text || ' บาท · ' || NEW.kind;
        extra := jsonb_build_object('userId',NEW.owner_id,'amount',NEW.amount,'refunded',NEW.refunded);
      ELSIF TG_TABLE_NAME='monitor_status' THEN
        IF TG_OP='UPDATE' AND NEW.status='READY' AND OLD.status='READY' THEN RETURN NEW; END IF;
        IF NOT EXISTS(SELECT 1 FROM rules WHERE id=NEW.rule_id AND active AND deleted_at IS NULL) THEN RETURN NEW; END IF;
        k := 'market:' || NEW.rule_id || ':' || NEW.exchange || ':' || NEW.pair;
        cat := 'market'; sev := CASE WHEN NEW.status='READY' THEN 'success' ELSE 'warning' END;
        state := CASE WHEN NEW.status='READY' THEN 'resolved' ELSE 'open' END;
        IF state='resolved' AND NOT EXISTS(SELECT 1 FROM admin_events WHERE event_key=k) THEN RETURN NEW; END IF;
        IF TG_OP='UPDATE' AND NEW.status=OLD.status AND EXISTS(SELECT 1 FROM admin_events WHERE event_key=k AND status=state) THEN RETURN NEW; END IF;
        heading := NEW.exchange || ' · ' || NEW.pair;
        description := NEW.status || ' · ' || COALESCE((SELECT spec->>'name' FROM rules WHERE id=NEW.rule_id),NEW.rule_id::text);
        extra := jsonb_build_object('ruleId',NEW.rule_id,'exchange',NEW.exchange,'pair',NEW.pair,'sourceStatus',NEW.status);
      ELSIF TG_TABLE_NAME='deliveries' THEN
        IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
        IF NEW.status NOT IN ('FAILED','AMBIGUOUS','RETRY','DELIVERED') THEN RETURN NEW; END IF;
        k := 'delivery:' || NEW.id; cat := 'delivery'; sev := CASE WHEN NEW.status='DELIVERED' THEN 'success' WHEN NEW.status='RETRY' THEN 'warning' ELSE 'error' END;
        state := CASE WHEN NEW.status='DELIVERED' THEN 'resolved' ELSE 'open' END;
        IF state='resolved' AND NOT EXISTS(SELECT 1 FROM admin_events WHERE event_key=k) THEN RETURN NEW; END IF;
        heading := CASE WHEN state='resolved' THEN 'ส่งแจ้งเตือนสำเร็จหลังขัดข้อง' ELSE 'ส่งแจ้งเตือนไม่สำเร็จ' END;
        description := COALESCE((SELECT kind || ' · ' || name FROM destinations WHERE id=NEW.destination_id),'ช่องทางถูกลบ') || ' · ' || NEW.status;
        extra := jsonb_build_object('deliveryId',NEW.id,'attempts',NEW.attempts,'sourceStatus',NEW.status);
      ELSIF TG_TABLE_NAME='agent_runs' THEN
        IF NEW.status NOT IN ('FAILED','ERROR','COMPLETED') THEN RETURN NEW; END IF;
        IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
        k := 'ai:' || NEW.owner_id; cat := 'system';
        IF NEW.status='COMPLETED' THEN
          IF NOT EXISTS(SELECT 1 FROM admin_events WHERE event_key=k AND status='open') THEN RETURN NEW; END IF;
          sev := 'success'; state := 'resolved'; heading := 'AI กลับมาประมวลผลสำเร็จ';
        ELSE sev := 'error'; state := 'open'; heading := 'การประมวลผล AI ล้มเหลว'; END IF;
        description := 'Run ' || NEW.id || ' · ' || NEW.status;
        extra := jsonb_build_object('runId',NEW.id,'userId',NEW.owner_id);
      ELSIF TG_TABLE_NAME='admin_audit' THEN
        k := 'admin:' || NEW.id; cat := 'admin'; sev := 'info'; heading := 'ผู้ดูแลดำเนินการ: ' || NEW.action;
        description := COALESCE((SELECT email FROM users WHERE id=NEW.actor_id),NEW.actor_id::text,'ถูกลบ') || ' → ' || COALESCE((SELECT email FROM users WHERE id=NEW.subject_id),NEW.subject_id::text,'ระบบ');
        extra := jsonb_build_object('auditId',NEW.id,'action',NEW.action);
      END IF;
      IF k IS NULL THEN RETURN NEW; END IF;
      INSERT INTO admin_events(event_key,category,severity,title,detail,status,resolved_at,metadata)
      VALUES(k,cat,sev,heading,description,state,CASE WHEN state='resolved' THEN now() END,extra)
      ON CONFLICT(event_key) DO UPDATE SET severity=excluded.severity,title=excluded.title,detail=excluded.detail,
        status=excluded.status,updated_at=now(),resolved_at=excluded.resolved_at,metadata=excluded.metadata,
        occurrences=admin_events.occurrences + CASE WHEN excluded.status='open' THEN 1 ELSE 0 END;
      RETURN NEW;
    END $$;
    CREATE OR REPLACE TRIGGER admin_signup AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION capture_admin_event();
    CREATE OR REPLACE TRIGGER admin_billing AFTER INSERT OR UPDATE ON billing_grants FOR EACH ROW EXECUTE FUNCTION capture_admin_event();
    CREATE OR REPLACE TRIGGER admin_market AFTER INSERT OR UPDATE ON monitor_status FOR EACH ROW EXECUTE FUNCTION capture_admin_event();
    CREATE OR REPLACE TRIGGER admin_delivery AFTER INSERT OR UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION capture_admin_event();
    CREATE OR REPLACE TRIGGER admin_ai AFTER INSERT OR UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION capture_admin_event();
    CREATE OR REPLACE TRIGGER admin_actions AFTER INSERT ON admin_audit FOR EACH ROW EXECUTE FUNCTION capture_admin_event();
    CREATE OR REPLACE FUNCTION close_paused_admin_incidents() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT NEW.active OR NEW.deleted_at IS NOT NULL THEN
        UPDATE admin_events SET status='resolved',severity='info',detail='เซตอัปหยุดเฝ้าตลาดแล้ว',updated_at=now(),resolved_at=now()
        WHERE category='market' AND status='open' AND metadata->>'ruleId'=NEW.id::text;
      END IF;
      RETURN NEW;
    END $$;
    CREATE OR REPLACE TRIGGER admin_paused_rule AFTER UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION close_paused_admin_incidents();

    INSERT INTO admin_events(event_key,category,severity,title,detail,created_at,updated_at,metadata)
    SELECT 'signup:'||id,'signup','info','มีผู้สมัครใหม่',COALESCE(email,id::text),created_at,created_at,jsonb_build_object('userId',id)
    FROM users WHERE created_at>=now()-interval '30 days' AND email IS DISTINCT FROM 'local@snaap.invalid'
    ON CONFLICT DO NOTHING;
    INSERT INTO admin_events(event_key,category,severity,title,detail,created_at,updated_at,metadata)
    SELECT 'billing:'||payment_id,'billing',CASE WHEN refunded THEN 'warning' ELSE 'success' END,
      CASE WHEN refunded THEN 'คืนเงินแพ็กเกจ Pro' ELSE 'ได้รับการชำระเงิน Pro' END,
      (amount/100.0)::text||' บาท · '||kind,COALESCE(received_at,now()),COALESCE(received_at,now()),jsonb_build_object('userId',owner_id,'refunded',refunded)
    FROM billing_grants WHERE received_at>=now()-interval '30 days' ON CONFLICT DO NOTHING;
    INSERT INTO admin_events(event_key,category,severity,title,detail,status,created_at,updated_at,metadata)
    SELECT 'delivery:'||d.id,'delivery',CASE WHEN d.status='RETRY' THEN 'warning' ELSE 'error' END,
      'ส่งแจ้งเตือนไม่สำเร็จ',dest.kind||' · '||dest.name||' · '||d.status,'open',s.created_at,s.created_at,
      jsonb_build_object('deliveryId',d.id,'sourceStatus',d.status)
    FROM deliveries d JOIN destinations dest ON dest.id=d.destination_id JOIN signals s ON s.id=d.signal_id
    WHERE d.status IN ('RETRY','FAILED','AMBIGUOUS') ON CONFLICT DO NOTHING;
    INSERT INTO admin_events(event_key,category,severity,title,detail,status,created_at,updated_at,metadata)
    SELECT DISTINCT ON(owner_id) 'ai:'||owner_id,'system','error','การประมวลผล AI ล้มเหลว','Run '||id||' · '||status,'open',created_at,created_at,jsonb_build_object('runId',id,'userId',owner_id)
    FROM agent_runs ar WHERE status IN ('FAILED','ERROR') AND created_at>=now()-interval '30 days'
      AND NOT EXISTS(SELECT 1 FROM agent_runs newer WHERE newer.owner_id=ar.owner_id AND newer.status='COMPLETED' AND newer.created_at>ar.created_at)
    ORDER BY owner_id,created_at DESC ON CONFLICT DO NOTHING;
    INSERT INTO admin_events(event_key,category,severity,title,detail,status,created_at,updated_at,metadata)
    SELECT 'market:'||ms.rule_id||':'||ms.exchange||':'||ms.pair,'market','warning',ms.exchange||' · '||ms.pair,
      ms.status||' · '||COALESCE(r.spec->>'name',r.id::text),'open',ms.checked_at,ms.checked_at,
      jsonb_build_object('ruleId',ms.rule_id,'sourceStatus',ms.status)
    FROM monitor_status ms JOIN rules r ON r.id=ms.rule_id WHERE ms.status!='READY' AND r.active AND r.deleted_at IS NULL
    ON CONFLICT DO NOTHING;
  `);
}
