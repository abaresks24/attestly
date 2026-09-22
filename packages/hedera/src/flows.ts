// Server-side orchestration of the issuance lifecycle, reusing the native helpers. These run in
// Next.js Node-runtime routes (demo mode: the server holds the demo actors' keys). The full flow is
// proven end-to-end in src/demo-issue.ts.
import type { Client } from "@hiero-ledger/sdk";
import { AccountId, PrivateKey } from "@hiero-ledger/sdk";
import { createAssetToken, createTopic, logToTopic, scheduleMint, signSchedule } from "./issuance.js";
import { verifyThresholdKey } from "./keys.js";
import { tokenInfo } from "./mirror.js";
import { idToEvmAddress } from "./evm.js";
import { registryAs } from "./registry.js";
import { storeDocument } from "./ipfs.js";

export interface DemoActor {
  id: string;
  evmAddress: string;
  privateKey: string; // ECDSA DER
}

export interface IssueParams {
  registryEvm: string;
  registryId: string; // 0.0.N (KYC/pause key on the token)
  issuer: DemoActor;
  attesters: DemoActor[];
  threshold: number;
  decimals: number;
  totalShares: number;
  scheduleExpirySeconds: number;
  name: string;
  symbol: string;
  filename: string;
  document: string;
}

export interface IssueResult {
  assetId: number;
  topicId: string;
  token: string;
  schedule: string;
  cid: string;
  sha256: string;
  pinned: boolean;
}

/** Runs submit -> token create -> mirror key verification -> registerToken -> scheduled mint. */
export async function issueAsset(client: Client, p: IssueParams): Promise<IssueResult> {
  const { cid, sha256, pinned } = await storeDocument(p.filename, p.document);

  const topicId = await createTopic(client, `Attested RWA: ${p.name}`);
  await logToTopic(client, topicId, JSON.stringify({ event: "submitted", cid, sha256 }));

  const registry = registryAs(p.registryEvm, p.issuer.privateKey);
  const submitReceipt = await (
    await registry.submitAsset(cid, sha256, p.totalShares, BigInt(topicId.split(".").pop() as string), { gasLimit: 600_000 })
  ).wait();
  const assetId = Number(
    submitReceipt.logs
      .map((l: any) => {
        try {
          return registry.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((x: any) => x?.name === "AssetSubmitted")!.args.assetId,
  );

  const attesterKeys = p.attesters.map((a) => PrivateKey.fromStringECDSA(a.privateKey).publicKey);
  const token = await createAssetToken(client, {
    name: p.name,
    symbol: p.symbol,
    decimals: p.decimals,
    maxSupply: p.totalShares,
    treasury: AccountId.fromString(p.issuer.id),
    treasuryKey: PrivateKey.fromStringECDSA(p.issuer.privateKey),
    attesterKeys,
    threshold: p.threshold,
    registryContractId: p.registryId,
  });

  // FR-2: refuse to register a token whose on-chain key set does not match.
  const info = await tokenInfo(token);
  const check = verifyThresholdKey(info.supply_key, p.threshold, attesterKeys);
  if (!check.ok || info.admin_key != null) {
    throw new Error(`token key set mismatch, not registering: ${[...check.reasons, info.admin_key ? "admin key present" : ""].join("; ")}`);
  }

  await (await registry.registerToken(assetId, idToEvmAddress(token), { gasLimit: 300_000 })).wait();
  await logToTopic(client, topicId, JSON.stringify({ event: "token", token }));

  const schedule = await scheduleMint(client, token, p.totalShares, p.scheduleExpirySeconds);
  return { assetId, topicId, token, schedule, cid, sha256, pinned };
}

/** Records an attestation on-chain + HCS and, if approving, adds the attester's signature to the mint. */
export async function attestAndSign(
  client: Client,
  params: {
    registryEvm: string;
    topicId: string;
    schedule: string;
    assetId: number;
    attester: DemoActor;
    approve: boolean;
    evidence: string;
    evidenceHash: string;
  },
): Promise<void> {
  const registry = registryAs(params.registryEvm, params.attester.privateKey);
  await (await registry.attest(params.assetId, params.approve, params.evidenceHash, { gasLimit: 300_000 })).wait();
  await logToTopic(
    client,
    params.topicId,
    JSON.stringify({ event: "attested", attester: params.attester.id, approve: params.approve, evidence: params.evidence }),
  );
  if (params.approve) await signSchedule(client, params.schedule, PrivateKey.fromStringECDSA(params.attester.privateKey));
}
