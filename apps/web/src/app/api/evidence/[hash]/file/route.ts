import { charityRegistryAbi, evidenceRegistryAbi } from "@/contracts/abis";
import { getDeployment } from "@/lib/shared/chain";
import { requireWallet } from "@/lib/server/auth";
import { publicClient } from "@/lib/server/chain";
import { getDb } from "@/lib/server/db";
import { readEvidence } from "@/lib/server/evidence-store";
import { handle, HASH_RE, HttpError, requireParam } from "@/lib/server/http";
import { VERIFIER_ROLE } from "@/lib/server/queries";

export function GET(req: Request, { params }: { params: Promise<{ hash: string }> }) {
  return handle(async () => {
    const wallet = await requireWallet(req, "evidence:read");
    const hash = requireParam((await params).hash, HASH_RE, "hash").toLowerCase();

    const row = getDb()
      .prepare("SELECT project_id, file_name, mime FROM evidence_files WHERE content_hash = ?")
      .get(hash) as { project_id: string; file_name: string; mime: string } | undefined;
    if (!row) throw new HttpError(404, "File not found");

    const dep = getDeployment();
    const [project, isVerifier] = await Promise.all([
      publicClient.readContract({
        address: dep.CharityRegistry,
        abi: charityRegistryAbi,
        functionName: "getProject",
        args: [BigInt(row.project_id)],
      }),
      publicClient.readContract({
        address: dep.EvidenceRegistry,
        abi: evidenceRegistryAbi,
        functionName: "hasRole",
        args: [VERIFIER_ROLE, wallet],
      }),
    ]);
    if (!isVerifier && project.charity.toLowerCase() !== wallet.toLowerCase()) {
      throw new HttpError(403, "Only verifiers and the owning charity can read evidence files");
    }

    const bytes = readEvidence(hash);
    if (!bytes) throw new HttpError(404, "File not found");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": row.mime,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox",
        "cache-control": "private, no-store",
      },
    });
  });
}
