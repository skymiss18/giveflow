import { publicClient } from "@/lib/server/chain";
import { handle } from "@/lib/server/http";

export function POST() {
  return handle(async () => {
    const blockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });
    return { ok: true, blockNumber: blockNumber.toString() };
  });
}
