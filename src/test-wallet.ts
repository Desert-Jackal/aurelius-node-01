import { CdpClient } from "@coinbase/cdp-sdk";
import "dotenv/config";

async function main() {
  console.log("? Initializing Coinbase Developer Platform SDK...");

  // CdpClient automatically reads CDP_API_KEY_ID and CDP_API_KEY_SECRET from .env
  const cdp = new CdpClient();

  console.log("?? Creating EVM Account on Base...");
  
  // Create an EVM account on Base
  const account = await cdp.evm.createAccount();

  console.log("\n==========================================");
  console.log("? AURELIUS NODE 01 WALLET SUCCESSFUL!");
  console.log(`?? Address: ${account.address}`);
  console.log("==========================================\n");
}

main().catch((error) => {
  console.error("? Error initializing CDP Client:", error);
});
