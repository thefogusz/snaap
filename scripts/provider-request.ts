/** Static instructions plus the per-turn developer context, as a fixture provider receives them. */
export function promptText(body: any): string {
  const developer = (body.input ?? [])
    .filter((item: any) => item.role === "developer")
    .map((item: any) => (typeof item.content === "string" ? item.content : JSON.stringify(item.content)));
  return [body.instructions ?? "", ...developer].join("\n");
}
/** The draft JSON supplied to the model for this turn. */
export function suppliedDraft(body: any): unknown {
  return JSON.parse(promptText(body).split("Current editable draft (not activated): ")[1].split("\n")[0]);
}
