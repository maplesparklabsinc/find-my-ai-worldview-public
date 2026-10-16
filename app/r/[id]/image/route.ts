// GET /r/{id}/image: the square share image (1080×1080) as a download.
import { SQUARE_SIZE, shareCard } from "@/components/share-card";
import { loadResponse, shown } from "@/lib/stored";

export async function GET(_req: Request, ctx: RouteContext<"/r/[id]/image">) {
  const { id } = await ctx.params;
  const row = await loadResponse(id);
  if (!row) return new Response("Not found", { status: 404 });
  const image = await shareCard(await shown(row), SQUARE_SIZE);
  const headers = new Headers(image.headers);
  headers.set("content-disposition", `attachment; filename="find-my-ai-worldview.png"`);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(image.body, { status: 200, headers });
}
