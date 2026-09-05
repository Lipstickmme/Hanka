import { Connection, ParsedInstruction, PartiallyDecodedInstruction, PublicKey } from "@solana/web3.js";
import { USDC_MINT, decimalToUsdcMicro } from "./constants";

type TransferInfo = {
  authority?: string;
  destination?: string;
  mint?: string;
  tokenAmount?: { amount?: string; decimals?: number };
};

function parsedTransfers(instructions: (ParsedInstruction | PartiallyDecodedInstruction)[]) {
  return instructions.flatMap(instruction => {
    if (!("parsed" in instruction) || !instruction.parsed || typeof instruction.parsed !== "object") return [];
    const parsed = instruction.parsed as { type?: string; info?: TransferInfo };
    if (parsed.type !== "transferChecked" || !parsed.info?.destination || !parsed.info.tokenAmount?.amount) return [];
    return [parsed.info];
  });
}

export async function verifyUsdcPayment(input: {
  signature: string;
  buyerWallet: string;
  expectedUsdc: string;
  earliestAllowedAt: Date;
}) {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const recipientWallet = process.env.SOLANA_RECIPIENT_WALLET;
  if (!rpcUrl || !recipientWallet) throw new Error("Payment verification is not configured");

  const connection = new Connection(rpcUrl, "finalized");
  const status = (await connection.getSignatureStatuses([input.signature], { searchTransactionHistory: true })).value[0];
  if (!status || status.err || status.confirmationStatus !== "finalized") {
    throw new Error("Payment is not finalized yet; try again after confirmation");
  }

  const transaction = await connection.getParsedTransaction(input.signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction || !transaction.meta || transaction.meta.err) throw new Error("Finalized payment details are unavailable");
  const meta = transaction.meta;
  if (!transaction.blockTime || transaction.blockTime * 1000 < input.earliestAllowedAt.getTime() - 60_000) {
    throw new Error("Payment predates this request");
  }

  const buyerSigned = transaction.transaction.message.accountKeys.some(
    account => account.signer && account.pubkey.equals(new PublicKey(input.buyerWallet)),
  );
  if (!buyerSigned) throw new Error("The submitted wallet did not authorize this payment");

  const outer = parsedTransfers(transaction.transaction.message.instructions);
  const inner = (meta.innerInstructions ?? []).flatMap(group => parsedTransfers(group.instructions));
  const transfers = [...outer, ...inner].filter(
    transfer => transfer.authority === input.buyerWallet && transfer.mint === USDC_MINT,
  );

  const expectedMicro = decimalToUsdcMicro(input.expectedUsdc);
  let receivedMicro = 0;
  for (const transfer of transfers) {
    const destination = new PublicKey(transfer.destination!);
    const account = await connection.getParsedAccountInfo(destination, "finalized");
    const data = account.value?.data;
    if (!data || typeof data !== "object" || !("parsed" in data)) continue;

    const info = (data.parsed as { info?: { owner?: string; mint?: string } }).info;
    if (info?.owner !== recipientWallet || info.mint !== USDC_MINT) continue;
    receivedMicro += Number(transfer.tokenAmount!.amount!);
  }

  if (receivedMicro !== expectedMicro) {
    throw new Error("The confirmed USDC amount does not exactly match this request");
  }

  return { signature: input.signature, receivedUsdc: input.expectedUsdc };
}
