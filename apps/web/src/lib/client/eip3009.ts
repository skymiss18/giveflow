import { parseSignature, type Address, type Hex } from "viem";

export const receiveWithAuthorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type ReceiveWithAuthorizationMessage = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export function receiveWithAuthorizationTypedData(params: {
  name: string;
  version: string;
  chainId: number;
  token: Address;
  message: ReceiveWithAuthorizationMessage;
}) {
  return {
    domain: {
      name: params.name,
      version: params.version,
      chainId: params.chainId,
      verifyingContract: params.token,
    },
    types: receiveWithAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization" as const,
    message: params.message,
  };
}

export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const parsed = parseSignature(signature);
  const v = parsed.v !== undefined ? Number(parsed.v) : Number(parsed.yParity) + 27;
  return {
    v,
    r: parsed.r,
    s: parsed.s,
  };
}