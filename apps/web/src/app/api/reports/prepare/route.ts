import { z } from "zod";
import { charityRegistryAbi } from "@/contracts/abis";
import { getDeployment } from "@/lib/shared/chain";
import { hashMetadata } from "@/lib/shared/metadata";
import { requireWallet } from "@/lib/server/auth";
import { publicClient } from "@/lib/server/chain";
import { getDb } from "@/lib/server/db";
import { handle, HttpError } from "@/lib/server/http";
import { buildReportSnapshot } from "@/lib/server/queries";

const bodySchema = z.object({ projectId: z.string().regex(/^\d{1,18}$/) });

export function POST(req: Request) {
  return handle(async () => {
    const wallet = await requireWallet(req, "report:prepare");
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) throw new HttpError(400, "projectId is required");
    const { projectId } = body.data;

    const dep = getDeployment();
    const project = await publicClient.readContract({
      address: dep.CharityRegistry,
      abi: charityRegistryAbi,
      functionName: "getProject",
      args: [BigInt(projectId)],
    });
    const isOwner = project.charity.toLowerCase() === wallet.toLowerCase();
    const isAdmin = dep.admin.toLowerCase() === wallet.toLowerCase();
    if (!isOwner && !isAdmin) throw new HttpError(403, "Only the project's charity or the admin can prepare a report");

    const snapshot = await buildReportSnapshot(projectId);
    if (!snapshot) throw new HttpError(404, "Project not found");

    const hash = hashMetadata("impact-report", snapshot);
    getDb()
      .prepare("INSERT OR IGNORE INTO metadata (hash, kind, data, created_at) VALUES (?, 'impact-report', ?, ?)")
      .run(hash, JSON.stringify(snapshot), Math.floor(Date.now() / 1000));
    return { reportHash: hash, uri: `/reports/${projectId}`, snapshot };
  });
}
