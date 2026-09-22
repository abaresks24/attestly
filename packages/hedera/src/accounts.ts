// Test-account creation for the demo seed. ECDSA secp256k1 keys (required for HIP-755 wallet
// signing), created with an EVM alias and unlimited automatic token associations. The guardian is a
// native ThresholdKey(k of n) ACCOUNT — a multisig without a multisig contract.
import {
  AccountCreateTransaction,
  Hbar,
  KeyList,
  PrivateKey,
  PublicKey,
  type Client,
} from "@hiero-ledger/sdk";

export interface DemoAccount {
  id: string;
  evmAddress: string;
  privateKey: string; // ECDSA DER hex
}

export interface GuardianAccount {
  id: string;
  evmAddress: string;
  threshold: number;
  members: DemoAccount[];
}

/** Funded ECDSA account with an EVM alias and unlimited auto-associations. */
export async function createEcdsaAccount(client: Client, balanceHbar: number): Promise<DemoAccount> {
  const key = PrivateKey.generateECDSA();
  const receipt = await (
    await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(key)
      .setInitialBalance(new Hbar(balanceHbar))
      .setMaxAutomaticTokenAssociations(-1)
      .execute(client)
  ).getReceipt(client);
  const id = receipt.accountId as NonNullable<typeof receipt.accountId>;
  return { id: id.toString(), evmAddress: "0x" + key.publicKey.toEvmAddress(), privateKey: key.toStringDer() };
}

/**
 * Native ThresholdKey(threshold of members) account for the guardian. Its account key is a threshold
 * key, so the mirror node reports it as a ProtobufEncoded threshold key — verifiable without any
 * multisig contract.
 */
export async function createThresholdAccount(
  client: Client,
  members: DemoAccount[],
  threshold: number,
  balanceHbar: number,
): Promise<GuardianAccount> {
  const keyList = new KeyList(
    members.map((m) => PrivateKey.fromStringECDSA(m.privateKey).publicKey as PublicKey),
    threshold,
  );
  const receipt = await (
    await new AccountCreateTransaction().setKey(keyList).setInitialBalance(new Hbar(balanceHbar)).execute(client)
  ).getReceipt(client);
  const id = receipt.accountId as NonNullable<typeof receipt.accountId>;
  return { id: id.toString(), evmAddress: "0x" + id.toSolidityAddress(), threshold, members };
}
