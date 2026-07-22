import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const SERVER_URL = "https://stock-groggy-fritter.ngrok-free.dev";
const BASE_SEPOLIA_USDC_CONTRACT = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const CHAIN_ID = 84532; // Base Sepolia Testnet

async function runClientAgentSimulation() {
  console.log("\n==================================================");
  console.log("🧪 [AI AGENT] Testing $0.05 Testnet USDC Payment Authorization...");
  console.log("==================================================\n");

  const requestHeaders = { "ngrok-skip-browser-warning": "true" };

  const challengeRes = await fetch(`${SERVER_URL}/api/v1/supply`, { headers: requestHeaders });
  const challengeData: any = await challengeRes.json();
  console.log("📜 [TOLLBOOTH CHALLENGE]:", challengeData.pricing);

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const recipientWallet = challengeData.pricing.recipient_address as `0x${string}`;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const validAfter = 0;
  const validBefore = nowInSeconds + 3600;
  const value = "50000"; // $0.05 Testnet USDC
  const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as `0x${string}`;

  const signature = await account.signTypedData({
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
      from: account.address,
      to: recipientWallet,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce,
    },
  });

  const payload = {
    from: account.address,
    to: recipientWallet,
    value: value,
    validBefore: validBefore,
    validAfter: validAfter,
    nonce: nonce,
    signature: signature
  };

  const paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");

  const authenticatedRes = await fetch(`${SERVER_URL}/api/v1/supply`, {
    headers: { ...requestHeaders, "x-402-authorization": paymentHeader }
  });

  const supplyData = await authenticatedRes.json();
  console.log("\n🔓 [PAYLOAD UNLOCKED VIA BASE SEPOLIA TESTNET!]:");
  console.log(JSON.stringify(supplyData, null, 2));
}

runClientAgentSimulation().catch(console.error);
