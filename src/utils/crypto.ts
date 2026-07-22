import { recoverTypedDataAddress } from "viem";

export interface X402PaymentPayload {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validBefore: number;
  validAfter: number;
  nonce: `0x${string}`;
  signature: `0x${string}`;
}

// 🧪 BASE SEPOLIA TESTNET PARAMETERS
export const BASE_SEPOLIA_USDC_CONTRACT = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const RECEIVER_WALLET = "0xF58d7a1D7D26b1Ea99dAEC6609E41989eEe855d6";
export const REQUIRED_AMOUNT_USDC_ATOMIC = "50000"; // $0.05 Testnet USDC (6 decimals)
export const CHAIN_ID = 84532; // Base Sepolia Testnet

export async function verifyPaymentAuthorization(authHeader: string): Promise<{ valid: boolean; reason?: string; payer?: string; valueUsd?: string }> {
  try {
    const payload: X402PaymentPayload = JSON.parse(Buffer.from(authHeader, "base64").toString("utf-8"));

    if (!payload.from || !payload.signature || !payload.to) {
      return { valid: false, reason: "Malformed x402 payment header structure." };
    }

    if (payload.to.toLowerCase() !== RECEIVER_WALLET.toLowerCase()) {
      return { valid: false, reason: `Recipient mismatch. Expected ${RECEIVER_WALLET}` };
    }

    if (BigInt(payload.value) < BigInt(REQUIRED_AMOUNT_USDC_ATOMIC)) {
      return { valid: false, reason: `Insufficient payment. Required: $0.05 USDC (${REQUIRED_AMOUNT_USDC_ATOMIC} units), Received: ${payload.value}` };
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.validBefore < nowInSeconds) {
      return { valid: false, reason: "Payment authorization payload has expired." };
    }

    // Recover address using Base Sepolia Chain ID (84532) and Testnet USDC Contract
    const recoveredAddress = await recoverTypedDataAddress({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: CHAIN_ID,
        verifyingContract: BASE_SEPOLIA_USDC_CONTRACT,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: payload.from,
        to: payload.to,
        value: BigInt(payload.value),
        validAfter: BigInt(payload.validAfter),
        validBefore: BigInt(payload.validBefore),
        nonce: payload.nonce,
      },
      signature: payload.signature,
    });

    if (recoveredAddress.toLowerCase() === payload.from.toLowerCase()) {
      console.log(`\n🧪 [TESTNET TOLLBOOTH SETTLED] $0.05 Testnet USDC Signature Verified!`);
      console.log(`   Payer: ${recoveredAddress}`);
      console.log(`   Network: Base Sepolia Testnet (ID 84532)\n`);
      return { valid: true, payer: recoveredAddress, valueUsd: "0.05" };
    } else {
      return { valid: false, reason: "Cryptographic signature validation failed." };
    }

  } catch (err: any) {
    return { valid: false, reason: `Verification Error: ${err.message}` };
  }
}
