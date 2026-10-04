import pg from "pg";
export function database(url: string) {
  return new pg.Pool({ connectionString: url, max: 8 });
}
export async function migrate(db: pg.Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, google_sub text UNIQUE, email text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, expires_at timestamptz NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_attempts (state_hash text PRIMARY KEY, verifier_hash text NOT NULL, nonce text NOT NULL, expires_at timestamptz NOT NULL);
    CREATE TABLE IF NOT EXISTS rules (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, revision integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT false, spec jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS rule_revisions (rule_id uuid REFERENCES rules, revision integer, spec jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(rule_id,revision));
    CREATE TABLE IF NOT EXISTS conversations (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS messages (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations, role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL, sources jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS entitlements (owner_id uuid PRIMARY KEY REFERENCES users, pro_until timestamptz, stripe_customer text UNIQUE);
    CREATE TABLE IF NOT EXISTS usage_ledger (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, mode text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS assets (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, name text NOT NULL, mime text NOT NULL, storage_path text NOT NULL, metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'library';
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id);
    CREATE TABLE IF NOT EXISTS asset_cleanup (id uuid PRIMARY KEY,storage_path text NOT NULL);
    CREATE TABLE IF NOT EXISTS imports (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, name text NOT NULL, rows jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS destinations (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, kind text NOT NULL, name text NOT NULL, config jsonb NOT NULL, verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE destinations ADD COLUMN IF NOT EXISTS appearance jsonb NOT NULL DEFAULT '{}';
    CREATE TABLE IF NOT EXISTS notification_quota(request_id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES users,month text NOT NULL);
    CREATE INDEX IF NOT EXISTS notification_quota_month ON notification_quota(month,owner_id);
    CREATE TABLE IF NOT EXISTS channel_cursors(key text PRIMARY KEY,offset_id bigint NOT NULL);
    CREATE TABLE IF NOT EXISTS signals (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, rule_id uuid NOT NULL REFERENCES rules, revision integer NOT NULL, exchange text NOT NULL, pair text NOT NULL, event jsonb NOT NULL, dedup text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS deliveries (id uuid PRIMARY KEY, signal_id uuid NOT NULL REFERENCES signals, destination_id uuid NOT NULL REFERENCES destinations, status text NOT NULL, attempts integer NOT NULL DEFAULT 0, detail text, UNIQUE(signal_id,destination_id));
    CREATE TABLE IF NOT EXISTS billing_events (id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS billing_grants (payment_id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, amount integer NOT NULL, kind text NOT NULL, refunded boolean NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS agent_runs (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users, conversation_id uuid NOT NULL REFERENCES conversations, status text NOT NULL, trace jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS rules_owner ON rules(owner_id);
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created_at);
    CREATE INDEX IF NOT EXISTS usage_owner_time ON usage_ledger(owner_id,created_at);
    CREATE INDEX IF NOT EXISTS signals_owner ON signals(owner_id,created_at);
    ALTER TABLE rules ADD COLUMN IF NOT EXISTS activated_at timestamptz;
    CREATE TABLE IF NOT EXISTS monitor_checkpoints (rule_id uuid REFERENCES rules,revision integer,exchange text,pair text,state jsonb NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(rule_id,revision,exchange,pair));
    CREATE TABLE IF NOT EXISTS monitor_status (rule_id uuid REFERENCES rules,exchange text,pair text,status text NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(rule_id,exchange,pair));
    CREATE TABLE IF NOT EXISTS replay_runs (id uuid PRIMARY KEY,owner_id uuid REFERENCES users,spec jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE imports ADD COLUMN IF NOT EXISTS account_scope text NOT NULL DEFAULT 'default';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS draft jsonb;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS draft_revision integer NOT NULL DEFAULT 0;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS setup_saved_at timestamptz;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS setup_status_known boolean NOT NULL DEFAULT false;
    ALTER TABLE rules ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS saved_rule_id uuid REFERENCES rules(id);
    CREATE INDEX IF NOT EXISTS conversations_saved_rule ON conversations(saved_rule_id);
    ALTER TABLE conversations ALTER COLUMN setup_status_known SET DEFAULT true;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS ui_card jsonb;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS setup_changes jsonb NOT NULL DEFAULT '[]';
    ALTER TABLE billing_grants ADD COLUMN IF NOT EXISTS starts_at timestamptz;
    ALTER TABLE billing_grants ADD COLUMN IF NOT EXISTS ends_at timestamptz;
    ALTER TABLE billing_grants ADD COLUMN IF NOT EXISTS received_at timestamptz;
    UPDATE billing_grants SET received_at=starts_at WHERE received_at IS NULL;
    ALTER TABLE billing_grants ALTER COLUMN received_at SET DEFAULT now();
    CREATE TABLE IF NOT EXISTS billing_refunds (payment_id text PRIMARY KEY,amount integer NOT NULL,full_refund boolean NOT NULL);
    CREATE TABLE IF NOT EXISTS exchange_connections (id uuid PRIMARY KEY,owner_id uuid REFERENCES users,exchange text NOT NULL,name text NOT NULL,credentials text NOT NULL,verified_at timestamptz,last_sync timestamptz,status text NOT NULL);
    ALTER TABLE exchange_connections ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'Spot' CHECK(market IN ('Spot','Futures'));
    ALTER TABLE exchange_connections ADD COLUMN IF NOT EXISTS privacy_consent_version text;
    ALTER TABLE exchange_connections ADD COLUMN IF NOT EXISTS privacy_consented_at timestamptz;
    ALTER TABLE exchange_connections ADD COLUMN IF NOT EXISTS auto_sync boolean NOT NULL DEFAULT false;
    ALTER TABLE exchange_connections ADD COLUMN IF NOT EXISTS sync_details jsonb;
    ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0;
    ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0;
    ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS estimated_usd numeric;
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS workspaces(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,name text NOT NULL,is_default boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS setup_shares(code_hash text PRIMARY KEY,owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,setup jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS setup_shares_owner ON setup_shares(owner_id);
    CREATE UNIQUE INDEX IF NOT EXISTS workspaces_default_owner ON workspaces(owner_id) WHERE is_default;
    ALTER TABLE rules ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces;
    UPDATE conversations c SET saved_rule_id=(SELECT r.id FROM messages m JOIN rules r ON r.id=(m.ui_card->>'ruleId')::uuid AND r.owner_id=c.owner_id AND r.deleted_at IS NULL WHERE m.conversation_id=c.id AND m.ui_card->>'type'='preset' AND m.ui_card->>'ruleId' IS NOT NULL ORDER BY m.created_at DESC,m.id DESC LIMIT 1) WHERE c.saved_rule_id IS NULL AND c.setup_saved_at IS NOT NULL;
    UPDATE conversations c SET saved_rule_id=(SELECT min(r.id::text)::uuid FROM rules r WHERE r.owner_id=c.owner_id AND r.workspace_id IS NOT DISTINCT FROM c.workspace_id AND r.deleted_at IS NULL AND r.spec=c.draft HAVING count(*)=1) WHERE c.saved_rule_id IS NULL AND c.setup_saved_at IS NOT NULL;
    CREATE TABLE IF NOT EXISTS data_scopes(owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('image','import','connection')),resource_id uuid NOT NULL,workspace_ids uuid[],PRIMARY KEY(owner_id,kind,resource_id));
  `);
}
export async function transaction<T>(
  db: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
