// Native issuance operations that cannot be signed from an EVM wallet: creating the asset token with
// a ThresholdKey supply key, creating the HCS topic and messages, and the scheduled mint that
// collects attester signatures one at a time. These run server-side. Proven in spikes S2 and S3.
import {
  ContractId,
  KeyList,
  PublicKey,
  PrivateKey,
  ScheduleCreateTransaction,
  ScheduleSignTransaction,
  Timestamp,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  type AccountId,
  type Client,
} from "@hiero-ledger/sdk";

export interface AssetTokenParams {
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: number;
  treasury: AccountId;
  treasuryKey: PrivateKey; // signs the create (treasury)
  attesterKeys: PublicKey[]; // supply-key committee
  threshold: number; // k of n
  registryContractId: string; // 0.0.N of AssetRegistry — holds the KYC + pause keys
}

/**
 * Creates the asset token with the exact key set the invariants require:
 * supply key = ThresholdKey(threshold of attesters), KYC key = pause key = AssetRegistry contract,
 * NO admin key (immutable), finite supply. The mint quorum is enforced by the network, not Solidity.
 */
export async function createAssetToken(client: Client, p: AssetTokenParams): Promise<string> {
  const supplyKey = new KeyList(p.attesterKeys, p.threshold);
  const registry = ContractId.fromString(p.registryContractId);

  const receipt = await (
    await (
      await new TokenCreateTransaction()
        .setTokenName(p.name)
        .setTokenSymbol(p.symbol)
        .setTokenType(TokenType.FungibleCommon)
        .setSupplyType(TokenSupplyType.Finite)
        .setDecimals(p.decimals)
        .setInitialSupply(0)
        .setMaxSupply(p.maxSupply)
        .setTreasuryAccountId(p.treasury)
        .setSupplyKey(supplyKey)
        .setKycKey(registry)
        .setPauseKey(registry)
        .freezeWith(client)
        .sign(p.treasuryKey)
    ).execute(client)
  ).getReceipt(client);

  return (receipt.tokenId as NonNullable<typeof receipt.tokenId>).toString();
}

/** Creates the per-asset HCS topic for the audit trail. */
export async function createTopic(client: Client, memo: string): Promise<string> {
  const receipt = await (
    await new TopicCreateTransaction().setTopicMemo(memo).execute(client)
  ).getReceipt(client);
  return (receipt.topicId as NonNullable<typeof receipt.topicId>).toString();
}

/** Appends a message to an asset's HCS topic. */
export async function logToTopic(client: Client, topicId: string, message: string): Promise<void> {
  await (
    await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client)
  ).getReceipt(client);
}

/** Schedules the mint (long-term expiry, HIP-423). Signatures are collected via {signSchedule}. */
export async function scheduleMint(
  client: Client,
  tokenId: string,
  amount: number,
  expirySeconds: number,
): Promise<string> {
  const expiry = new Timestamp(Math.floor(Date.now() / 1000) + expirySeconds, 0);
  const receipt = await (
    await new ScheduleCreateTransaction()
      .setScheduledTransaction(new TokenMintTransaction().setTokenId(tokenId).setAmount(amount))
      .setExpirationTime(expiry)
      .setWaitForExpiry(false)
      .execute(client)
  ).getReceipt(client);
  return (receipt.scheduleId as NonNullable<typeof receipt.scheduleId>).toString();
}

/** Adds one attester signature to the scheduled mint. Executes automatically at the k-th signature. */
export async function signSchedule(client: Client, scheduleId: string, attesterKey: PrivateKey): Promise<void> {
  await (
    await (await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client)).sign(attesterKey)
  ).execute(client);
}
