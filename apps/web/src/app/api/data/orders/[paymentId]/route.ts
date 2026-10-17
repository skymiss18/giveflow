import { handle, HASH_RE, HttpError, requireParam } from "@/lib/server/http";
import { getOrders } from "@/lib/server/queries";

export function GET(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  return handle(async () => {
    const paymentId = requireParam((await params).paymentId, HASH_RE, "payment id");
    const [order] = await getOrders({ paymentId });
    if (!order) throw new HttpError(404, "Order not found");
    return order;
  });
}
