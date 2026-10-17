import { handle, HttpError, requireParam, UINT_RE } from "@/lib/server/http";
import { getPublishedReport } from "@/lib/server/queries";

export function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    const projectId = requireParam((await params).projectId, UINT_RE, "project id");
    const v = new URL(req.url).searchParams.get("version");
    const report = await getPublishedReport(projectId, v ? Number(requireParam(v, UINT_RE, "version")) : undefined);
    if (!report) throw new HttpError(404, "No report published for this project");
    return report;
  });
}
