import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
/** Conservative egress policy: only operator-allowed HTTPS hosts, public IPv4, no redirects. */
export function publicIPv4(ip: string) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function postWebhook(
  address: string,
  body: string | Buffer,
  headers: Record<string, string> = {},
  allowedHosts?: readonly string[],
) {
  const url = new URL(address),
    allowed =
      allowedHosts ??
      (process.env.WEBHOOK_ALLOWED_HOSTS ?? "").split(",").map((x) => x.trim());
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    !allowed.includes(url.hostname) ||
    isIP(url.hostname)
  )
    throw new Error("DESTINATION_NOT_ALLOWED");
  const results = await lookup(url.hostname, { all: true, family: 4 });
  if (!results.length || results.some((r) => !publicIPv4(r.address)))
    throw new Error("DESTINATION_NOT_PUBLIC");
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        lookup: ((_host: any, opts: any, cb: any) =>
          opts.all
            ? cb(null, [results[0]])
            : cb(null, results[0].address, 4)) as any,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 65536) {
            req.destroy(new Error("RESPONSE_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error("TIMEOUT")));
    // setTimeout above is an idle timeout; a trickling response also needs an overall cap.
    const overall = setTimeout(() => req.destroy(new Error("TIMEOUT")), 15000);
    req.on("close", () => clearTimeout(overall));
    req.on("error", reject);
    req.end(body);
  });
}
