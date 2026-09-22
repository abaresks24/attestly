import { expect } from "chai";
import { ethers } from "hardhat";
import { InvestorRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("InvestorRegistry", () => {
  let registry: InvestorRegistry;
  let admin: HardhatEthersSigner;
  let investor: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  beforeEach(async () => {
    [admin, investor, stranger] = await ethers.getSigners();
    registry = await ethers.deployContract("InvestorRegistry", [admin.address]);
  });

  it("only the admin can approve an investor", async () => {
    await expect(registry.connect(stranger).approve(investor.address)).to.be.revertedWithCustomError(
      registry,
      "NotAdmin",
    );
    expect(await registry.isVerified(investor.address)).to.equal(false);

    await expect(registry.connect(admin).approve(investor.address))
      .to.emit(registry, "InvestorApproved")
      .withArgs(investor.address);
    expect(await registry.isVerified(investor.address)).to.equal(true);
  });

  it("admin can revoke a previously approved investor", async () => {
    await registry.connect(admin).approve(investor.address);
    await registry.connect(admin).revoke(investor.address);
    expect(await registry.isVerified(investor.address)).to.equal(false);
  });

  it("admin can be transferred and the old admin loses rights", async () => {
    await registry.connect(admin).transferAdmin(stranger.address);
    expect(await registry.admin()).to.equal(stranger.address);
    await expect(registry.connect(admin).approve(investor.address)).to.be.revertedWithCustomError(registry, "NotAdmin");
  });
});
