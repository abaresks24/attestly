// S4 — A contract as the KYC key and pause key of an HTS token.
//
// Question: can a smart contract hold the KYC key and pause key of an HTS token and grant KYC /
// pause / unpause through the HTS system contract at 0x167?
//
// Token: treasury = issuer; KYC key = pause key = KycPauseProbe contract; supply key = operator;
// no admin key. PASS if KYC grant, refusal of an un-KYC'd transfer (176), pause (265) and unpause
// are all verified on the mirror node.
import {
  ContractCreateFlow,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  Status,
  type Client,
} from "@hashgraph/sdk";
import { loadOperator, testnetClient, link, idToEvmAddress } from "./lib/hedera.js";
import { loadKeystore, keyOf, idOf, type TestAccount } from "./lib/accounts.js";
import { mirrorGet } from "./lib/mirror.js";
import { compile } from "./lib/compile.js";

const MINT = 100_000; // 1000.00
const XFER = 1_000; // 10.00

function need(store: Record<string, TestAccount>, name: string): TestAccount {
  const a = store[name];
  if (!a) throw new Error(`Missing '${name}' in .keys.json — run: yarn accounts`);
  return a;
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

/** Runs a transfer that must fail at consensus; returns the Hedera status name. */
async function expectTransferFail(
  client: Client,
  token: string,
  from: TestAccount,
  to: TestAccount,
  amount: number,
): Promise<string> {
  try {
    const tx = await new TransferTransaction()
      .addTokenTransfer(token, idOf(from), -amount)
      .addTokenTransfer(token, idOf(to), amount)
      .freezeWith(client);
    await (await (await tx.sign(keyOf(from))).execute(client)).getReceipt(client);
    return "SUCCEEDED_UNEXPECTEDLY";
  } catch (e: any) {
    return e?.status?.toString() ?? String(e?.message ?? e);
  }
}

async function transfer(
  client: Client,
  token: string,
  from: TestAccount,
  to: TestAccount,
  amount: number,
) {
  const tx = await new TransferTransaction()
    .addTokenTransfer(token, idOf(from), -amount)
    .addTokenTransfer(token, idOf(to), amount)
    .freezeWith(client);
  await (await (await tx.sign(keyOf(from))).execute(client)).getReceipt(client);
}

async function callProbe(
  client: Client,
  contractId: ContractId,
  fn: string,
  params: ContractFunctionParameters,
): Promise<number> {
  const record = await (
    await new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(1_000_000)
      .setFunction(fn, params)
      .execute(client)
  ).getRecord(client);
  return record.contractFunctionResult?.gasUsed?.toNumber() ?? 0;
}

async function main() {
  const op = loadOperator();
  const client = testnetClient(op);
  const store = loadKeystore();
  const issuer = need(store, "issuer");
  const investor = need(store, "investor");
  const outsider = need(store, "outsider");
  const gas: Record<string, number> = {};

  console.log("== S4: contract as KYC key + pause key ==");

  // 1. Deploy KycPauseProbe (deployer = operator).
  const { bytecode } = compile("contracts/KycPauseProbe.sol", "KycPauseProbe");
  const deploy = await (
    await new ContractCreateFlow().setBytecode(bytecode).setGas(1_000_000).execute(client)
  ).getReceipt(client);
  const contractId = deploy.contractId!;
  console.log(`probe ${contractId.toString()}  ${link.contract(contractId.toString())}`);

  // 2. Token with KYC key = pause key = the contract; supply key = operator; no admin key.
  const tokenReceipt = await (
    await (
      await new TokenCreateTransaction()
        .setTokenName("Attested Share (S4)")
        .setTokenSymbol("ATTS4")
        .setTokenType(TokenType.FungibleCommon)
        .setSupplyType(TokenSupplyType.Finite)
        .setDecimals(2)
        .setInitialSupply(0)
        .setMaxSupply(1_000_000)
        .setTreasuryAccountId(idOf(issuer))
        .setSupplyKey(op.key.publicKey)
        .setKycKey(contractId)
        .setPauseKey(contractId)
        .freezeWith(client)
        .sign(keyOf(issuer))
    ).execute(client)
  ).getReceipt(client);
  const token = tokenReceipt.tokenId!.toString();
  console.log(`token ${token}  ${link.token(token)}`);

  // 3. Mint into the issuer treasury (supply key = operator).
  await (
    await new TokenMintTransaction().setTokenId(token).setAmount(MINT).execute(client)
  ).getReceipt(client);

  // 4. Associate investor and outsider (KYC can only be granted to an associated account).
  for (const acct of [investor, outsider]) {
    await (
      await (
        await new TokenAssociateTransaction()
          .setAccountId(idOf(acct))
          .setTokenIds([token])
          .freezeWith(client)
          .sign(keyOf(acct))
      ).execute(client)
    ).getReceipt(client);
  }

  // 5. Grant KYC to investor via the contract; verify on the mirror node.
  gas.grantKyc = await callProbe(
    client,
    contractId,
    "grantKyc",
    // HTS resolves an aliased (ECDSA) account by its alias EVM address, not its long-zero form.
    new ContractFunctionParameters().addAddress(idToEvmAddress(token)).addAddress(investor.evmAddress),
  );
  const kyc = await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${token}`, {
    until: (d) => d?.tokens?.[0]?.kyc_status === "GRANTED",
  });
  assert(kyc?.tokens?.[0]?.kyc_status === "GRANTED", "investor KYC not GRANTED on mirror");
  console.log(`grantKyc ok (gas ${gas.grantKyc}); investor kyc_status=GRANTED`);

  // 6. Transfer to the KYC'd investor: succeeds.
  await transfer(client, token, issuer, investor, XFER);
  const bal = await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${token}`, {
    until: (d) => Number(d?.tokens?.[0]?.balance) === XFER,
  });
  assert(Number(bal?.tokens?.[0]?.balance) === XFER, "investor did not receive shares");
  console.log(`transfer to investor ok (balance ${XFER})`);

  // 7. Transfer to the un-KYC'd outsider: refused.
  const outsiderCode = await expectTransferFail(client, token, issuer, outsider, XFER);
  assert(outsiderCode === "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN", `unexpected outsider code: ${outsiderCode}`);
  console.log(`transfer to outsider refused: ${outsiderCode}`);

  // 8. Pause via the contract; verify; a transfer then fails.
  gas.pause = await callProbe(
    client,
    contractId,
    "pause",
    new ContractFunctionParameters().addAddress(idToEvmAddress(token)),
  );
  await mirrorGet(`/tokens/${token}`, { until: (d) => d?.pause_status === "PAUSED" });
  console.log(`pause ok (gas ${gas.pause}); pause_status=PAUSED`);
  const pausedCode = await expectTransferFail(client, token, issuer, investor, XFER);
  assert(pausedCode === "TOKEN_IS_PAUSED", `unexpected paused code: ${pausedCode}`);
  console.log(`transfer while paused refused: ${pausedCode}`);

  // 9. Unpause; transfers resume.
  gas.unpause = await callProbe(
    client,
    contractId,
    "unpause",
    new ContractFunctionParameters().addAddress(idToEvmAddress(token)),
  );
  await mirrorGet(`/tokens/${token}`, { until: (d) => d?.pause_status === "UNPAUSED" });
  await transfer(client, token, issuer, investor, XFER);
  console.log(`unpause ok (gas ${gas.unpause}); transfer resumed`);

  console.log(`\ngas: grantKyc=${gas.grantKyc} pause=${gas.pause} unpause=${gas.unpause}`);
  console.log("S4 PASS");
  console.log(JSON.stringify({ token, contractId: contractId.toString(), gas, outsiderCode, pausedCode }));
  client.close();
}

main().catch((e) => {
  console.error("\nS4 FAIL:", e?.message ?? e);
  process.exit(1);
});
