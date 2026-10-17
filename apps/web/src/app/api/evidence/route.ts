import { keccak256 } from "viem";
import { charityRegistryAbi } from "@/contracts/abis";
import { getDeployment } from "@/lib/shared/chain";
import { requireWallet } from "@/lib/server/auth";
import { publicClient } from "@/lib/server/chain";
import { getDb } from "@/lib/server/db";
import { saveEvidence } from "@/lib/server/evidence-store";
import { ensureSynced } from "@/lib/server/indexer";
import { handle, HttpError, requireParam, UINT_RE } from "@/lib/server/http";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"]);

export function POST(req: Request) {
  return handle(async () => {
    const wallet = await requireWallet(req, "evidence:upload");
    const form = await req.formData();
    const projectId = requireParam(String(form.get("projectId") ?? ""), UINT_RE, "projectId");
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "file is required");
    if (file.size === 0 || file.size > MAX_BYTES) throw new HttpError(400, "File must be between 1 byte and 10 MB");
    if (!ALLOWED_MIME.has(file.type)) throw new HttpError(400, "Only PDF, PNG, JPEG or plain-text files are accepted");

    const dep = getDeployment();
    const [project, approved] = await Promise.all([
      publicClient.readContract({
        address: dep.CharityRegistry,
        abi: charityRegistryAbi,
        functionName: "getProject",
        args: [BigInt(projectId)],
      }),
      publicClient.readContract({
        address: dep.CharityRegistry,
        abi: charityRegistryAbi,
        functionName: "isApprovedCharity",
        args: [wallet],
      }),
    ]);
    if (project.charity.toLowerCase() !== wallet.toLowerCase() || !approved) {
      throw new HttpError(403, "Only the approved charity that owns this project can upload evidence");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentHash = keccak256(bytes);
    saveEvidence(contentHash, bytes);
    getDb()
      .prepare(
        "INSERT OR IGNORE INTO evidence_files (content_hash, project_id, file_name, mime, size, uploader, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(contentHash, projectId, file.name.slice(0, 200), file.type, bytes.length, wallet, Math.floor(Date.now() / 1000));

    await ensureSynced();
    return { contentHash, storageRef: `local://evidence/${contentHash}`, size: bytes.length, name: file.name };
  });
}
