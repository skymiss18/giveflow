import { BaseError, ContractFunctionRevertedError } from "viem";

const MESSAGES: Record<string, string> = {
  AssetMismatch: "The payment asset does not match this campaign.",
  PriceChanged: "The price changed. Reload the page and try again.",
  OrderExpired: "This order expired. Start a new purchase.",
  OrderAlreadyUsed: "This order was already submitted.",
  CampaignInactive: "This campaign is not accepting purchases (paused or replaced by a newer version).",
  SalesPaused: "Sales are temporarily paused by the platform.",
  OutsideSaleWindow: "This campaign is outside its sale window.",
  PartyNotActive: "The merchant or the charity project is no longer active.",
  DonationCapReached: "This campaign has reached its donation cap.",
  ProductMismatch: "The product does not match this campaign.",
  InvalidQuantity: "Quantity must be at least 1.",
  NotSettleable: "This payment cannot be settled yet.",
  NotRefundable: "This payment can no longer be refunded.",
  Unauthorized: "Your wallet is not allowed to do this.",
  InvalidState: "This action is not valid in the current state.",
  AuthorizationOutlivesOrder: "This signed payment outlives the order. Refresh and sign again.",
  AuthorizationNotYetValid: "This signed payment is not valid yet.",
  AuthorizationExpired: "Authorization expired, sign again",
  AuthorizationAlreadyUsed: "This signed payment was already used.",
  CallerMustBePayee: "This signature can only be submitted by the intended payee.",
  InvalidSignature: "Invalid wallet signature",
  NotApprovedMerchant: "Your merchant account is not approved yet.",
  NotApprovedCharity: "Your charity account is not approved yet.",
  NotProductOwner: "This product belongs to a different merchant.",
  TokenNotAllowed: "This payment token is not allowed.",
  InvalidDonationRule: "Donation must be fixed or percentage (not both) and must leave a positive merchant share.",
  InvalidSaleWindow: "The sale window is invalid.",
  InvalidRefundWindow: "The refund window is too long (maximum 30 days).",
  NotProjectCharity: "Only the approved charity that owns this project can do this.",
  DuplicateEvidence: "This file was already registered as evidence.",
  NoVerifiedEvidence: "Publish a report only after at least one evidence item is verified.",
  SelfVerification: "You cannot verify evidence you submitted.",
  NotOwner: "Your wallet is not a signer of this treasury.",
  ThresholdNotMet: "Not enough signer approvals yet.",
  AlreadyApproved: "You already approved this proposal.",
  AccessControlUnauthorizedAccount: "Your wallet does not have the required role.",
  ERC20InsufficientBalance: "Insufficient token balance.",
  ERC20InsufficientAllowance: "Token allowance is too low. Approve first.",
  FaucetCapExceeded: "The faucet limit per request is 1,000 mUSDC.",
};

export function isWalletConnectionCancelled(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const current = error as { code?: unknown; message?: unknown; cause?: unknown };
    if (current.code === 4001 || current.code === 5000 ||
      current.message === "Connection request reset. Please try again.") return true;
    error = current.cause;
  }
  return false;
}

export function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name];
      if (name) return `Transaction would fail: ${name}`;
    }
    if (/User rejected|denied/i.test(error.message)) return "Request rejected in wallet.";
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}