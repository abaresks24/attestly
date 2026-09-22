import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AssetRegistry, InvestorRegistry, MockHederaTokenService } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const LOCKUP = 600; // seconds
const TOKEN = "0x0000000000000000000000000000000000001234"; // stand-in token address
const PAIR = "0x0000000000000000000000000000000000005678";
const CID = "bafkreigh2akiscaildc";
const DOC_HASH = ethers.keccak256(ethers.toUtf8Bytes("deed.pdf"));
const SHARES = 1_000_000n;
const TOPIC = 4321n;

describe("AssetRegistry", () => {
  let hts: MockHederaTokenService;
  let investors: InvestorRegistry;
  let registry: AssetRegistry;
  let admin: HardhatEthersSigner; // deployer + investor-registry admin
  let issuer: HardhatEthersSigner;
  let guardian: HardhatEthersSigner;
  let investor: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  beforeEach(async () => {
    [admin, issuer, guardian, investor, stranger] = await ethers.getSigners();
    hts = await ethers.deployContract("MockHederaTokenService");
    investors = await ethers.deployContract("InvestorRegistry", [admin.address]);
    registry = await ethers.deployContract("AssetRegistry", [
      guardian.address,
      await investors.getAddress(),
      LOCKUP,
      await hts.getAddress(),
    ]);
  });

  /// Drives an asset to the Minted state (lockup running).
  async function mintedAsset(): Promise<bigint> {
    await registry.connect(issuer).submitAsset(CID, DOC_HASH, SHARES, TOPIC);
    const id = 0n;
    await registry.connect(issuer).registerToken(id, TOKEN);
    await registry.connect(issuer).confirmMint(id);
    return id;
  }

  it("records a submission and only the issuer can register its token", async () => {
    await expect(registry.connect(issuer).submitAsset(CID, DOC_HASH, SHARES, TOPIC))
      .to.emit(registry, "AssetSubmitted")
      .withArgs(0n, issuer.address, CID, DOC_HASH, SHARES, TOPIC);

    await expect(registry.connect(stranger).registerToken(0n, TOKEN)).to.be.revertedWithCustomError(
      registry,
      "NotIssuer",
    );
    await registry.connect(issuer).registerToken(0n, TOKEN);
    expect((await registry.getAsset(0n)).token).to.equal(TOKEN);
  });

  it("lockup blocks KYC grants until finalize", async () => {
    const id = await mintedAsset();

    // During the lockup no KYC can be granted: finalize is time-gated and enableAsset needs finalized.
    await expect(registry.finalize(id, PAIR)).to.be.revertedWithCustomError(registry, "LockupActive");
    await investors.connect(admin).approve(investor.address);
    await expect(registry.connect(investor).enableAsset(id)).to.be.revertedWithCustomError(registry, "NotFinalized");
    expect(await hts.kycGranted(TOKEN, PAIR)).to.equal(false);
  });

  it("finalize only succeeds after the lockup and grants KYC to the pair", async () => {
    const id = await mintedAsset();
    await time.increase(LOCKUP + 1);

    await expect(registry.finalize(id, PAIR)).to.emit(registry, "Finalized").withArgs(id, PAIR);
    expect(await hts.kycGranted(TOKEN, PAIR)).to.equal(true);
    expect((await registry.getAsset(id)).status).to.equal(4); // Finalized
  });

  it("a verified investor can enable a finalized asset; an unverified one cannot", async () => {
    const id = await mintedAsset();
    await time.increase(LOCKUP + 1);
    await registry.finalize(id, PAIR);

    await expect(registry.connect(investor).enableAsset(id)).to.be.revertedWithCustomError(
      registry,
      "NotVerifiedInvestor",
    );

    await investors.connect(admin).approve(investor.address);
    await expect(registry.connect(investor).enableAsset(id))
      .to.emit(registry, "AssetEnabled")
      .withArgs(id, investor.address);
    expect(await hts.kycGranted(TOKEN, investor.address)).to.equal(true);
  });

  it("only the guardian can pause and unpause", async () => {
    const id = await mintedAsset();

    await expect(registry.connect(stranger).pause(id)).to.be.revertedWithCustomError(registry, "NotGuardian");

    await expect(registry.connect(guardian).pause(id)).to.emit(registry, "Paused").withArgs(id);
    expect(await hts.paused(TOKEN)).to.equal(true);

    await expect(registry.connect(guardian).unpause(id)).to.emit(registry, "Unpaused").withArgs(id);
    expect(await hts.paused(TOKEN)).to.equal(false);
  });
});
