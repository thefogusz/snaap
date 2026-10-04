import EmbeddedPostgres from "embedded-postgres";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
export async function localDatabase() {
  const directory = path.resolve(".local");
  const port = Number(process.env.SNAAP_LOCAL_DB_PORT ?? 55432);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid SNAAP_LOCAL_DB_PORT');
  await mkdir(directory, { recursive: true });
  const secretFile = path.join(directory, "database-password");
  let password: string;
  try {
    password = await readFile(secretFile, "utf8");
  } catch {
    password = randomBytes(32).toString("hex");
    await writeFile(secretFile, password, { mode: 0o600 });
  }
  const url = `postgresql://snaap:${password}@127.0.0.1:${port}/snaap_utf8`;
  const probe = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 1500,
  });
  try {
    await probe.connect();
    await probe.query("SELECT 1");
    await probe.end();
    return { url, stop: async () => {} };
  } catch {
    await probe.end().catch(() => {});
  }
  const databaseDir = path.join(directory, "postgres");
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: "snaap",
    password,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  let exists = true;
  try {
    await access(path.join(databaseDir, "PG_VERSION"));
  } catch {
    exists = false;
  }
  if (!exists) await postgres.initialise();
  await postgres.start();
  const client = postgres.getPgClient();
  await client.connect();
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname='snaap_utf8'",
  );
  if (!result.rowCount)
    await client.query(
      "CREATE DATABASE snaap_utf8 WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'",
    );
  await client.end();
  return {
    url,
    stop: async () => {
      if (process.platform === "win32")
        await promisify(execFile)(
          path.resolve(
            "node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe",
          ),
          ["stop", "-D", databaseDir, "-m", "fast", "-w"],
        );
      else await postgres.stop();
    },
  };
}
