import { handle, HttpError, requireParam, UINT_RE } from "@/lib/server/http";
import { getProjectDetail } from "@/lib/server/queries";

export function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = requireParam((await params).id, UINT_RE, "project id");
    const project = await getProjectDetail(id);
    if (!project) throw new HttpError(404, "Project not found");
    return project;
  });
}
