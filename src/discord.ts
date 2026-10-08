export function discordWebhookUrl(address: string) {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "discord.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/(?:v10\/)?webhooks\/\d{15,22}\/[A-Za-z0-9_-]{40,200}$/.test(
      url.pathname,
    )
  )
    throw new Error("INVALID_DISCORD_WEBHOOK");
  url.searchParams.set("wait", "true");
  return url.toString();
}
