// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaTokenService } from "./interfaces/IHederaTokenService.sol";
import { InvestorRegistry } from "./InvestorRegistry.sol";

/// Holds the KYC key and pause key of issued RWA tokens and enforces the asset lifecycle:
/// submit -> registerToken -> confirmMint (lockup starts) -> finalize (KYC opens) -> trading.
///
/// The token itself is created off-chain in a server route: a native TokenCreate with a `ThresholdKey`
/// supply key cannot be signed from an EVM wallet. The app verifies the token's key set on the mirror
/// node before calling {registerToken}. Because this contract is the token's KYC key and pause key, it
/// is the ONLY path that can grant KYC or pause the token — that exclusivity is enforced by Hedera, not
/// by Solidity. No admin key exists on the token, so this wiring is immutable.
contract AssetRegistry {
    /// HTS system contract. Injectable ONLY so unit tests can pass a mock; production is always 0x167
    /// (the local Hardhat network has no HTS precompile). Immutable, so it cannot be swapped later.
    IHederaTokenService private immutable hts;
    int64 private constant HTS_SUCCESS = 22;

    InvestorRegistry public immutable investors;
    /// Emergency guardian: a native `ThresholdKey(2 of 3)` account, not a multisig contract.
    address public immutable guardian;
    /// Seconds shares stay locked in the treasury after mint before {finalize} can open trading.
    uint64 public immutable lockupPeriod;

    enum Status {
        None,
        Submitted,
        Registered,
        Minted,
        Finalized
    }

    struct Asset {
        address issuer;
        address token; // long-zero EVM address of the HTS token; set on registerToken
        bytes32 documentHash; // SHA-256 of the IPFS document
        string cid; // IPFS CID of the attested document
        uint64 shares; // total shares (raw units)
        uint64 topicId; // HCS topic entity number (created off-chain; stored for reference)
        uint64 lockupEnds; // unix seconds; set on confirmMint
        Status status;
    }

    Asset[] private assets;
    /// assetId => attester => already recorded a decision
    mapping(uint256 => mapping(address => bool)) public hasAttested;

    event AssetSubmitted(
        uint256 indexed assetId,
        address indexed issuer,
        string cid,
        bytes32 documentHash,
        uint64 shares,
        uint64 topicId
    );
    event TokenRegistered(uint256 indexed assetId, address indexed token);
    event Attested(uint256 indexed assetId, address indexed attester, bool approve, bytes32 evidenceHash);
    event MintConfirmed(uint256 indexed assetId, uint64 lockupEnds);
    event Finalized(uint256 indexed assetId, address indexed pair);
    event AssetEnabled(uint256 indexed assetId, address indexed investor);
    event Paused(uint256 indexed assetId);
    event Unpaused(uint256 indexed assetId);

    error NotIssuer();
    error NotGuardian();
    error NotVerifiedInvestor();
    error WrongStatus(Status expected, Status actual);
    error LockupActive(uint64 lockupEnds);
    error NotFinalized();
    error HtsError(int64 responseCode);
    error UnknownAsset();
    error ZeroAddress();

    constructor(address guardian_, InvestorRegistry investors_, uint64 lockupPeriod_, address htsPrecompile) {
        if (guardian_ == address(0) || address(investors_) == address(0) || htsPrecompile == address(0)) {
            revert ZeroAddress();
        }
        guardian = guardian_;
        investors = investors_;
        lockupPeriod = lockupPeriod_;
        hts = IHederaTokenService(htsPrecompile);
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    // --------------------------------------------------------------------- lifecycle

    /// Issuer registers an asset. The IPFS upload and HCS topic creation happen off-chain first.
    function submitAsset(
        string calldata cid,
        bytes32 documentHash,
        uint64 shares,
        uint64 topicId
    ) external returns (uint256 assetId) {
        assetId = assets.length;
        assets.push(
            Asset({
                issuer: msg.sender,
                token: address(0),
                documentHash: documentHash,
                cid: cid,
                shares: shares,
                topicId: topicId,
                lockupEnds: 0,
                status: Status.Submitted
            })
        );
        emit AssetSubmitted(assetId, msg.sender, cid, documentHash, shares, topicId);
    }

    /// Records the token whose key set the app has already verified on the mirror node.
    function registerToken(uint256 assetId, address token) external {
        Asset storage a = _asset(assetId);
        if (msg.sender != a.issuer) revert NotIssuer();
        if (a.status != Status.Submitted) revert WrongStatus(Status.Submitted, a.status);
        if (token == address(0)) revert ZeroAddress();
        a.token = token;
        a.status = Status.Registered;
        emit TokenRegistered(assetId, token);
    }

    /// Records an attester's decision for the on-chain audit trail. The mint quorum itself is enforced
    /// natively by the token's `ThresholdKey` supply key (via a scheduled mint), not here.
    function attest(uint256 assetId, bool approve, bytes32 evidenceHash) external {
        Asset storage a = _asset(assetId);
        if (a.status != Status.Registered) revert WrongStatus(Status.Registered, a.status);
        hasAttested[assetId][msg.sender] = true;
        emit Attested(assetId, msg.sender, approve, evidenceHash);
    }

    /// Issuer confirms the scheduled mint executed (the app verifies total supply on the mirror). Starts
    /// the lockup during which no KYC can be granted, so shares cannot leave the treasury.
    function confirmMint(uint256 assetId) external {
        Asset storage a = _asset(assetId);
        if (msg.sender != a.issuer) revert NotIssuer();
        if (a.status != Status.Registered) revert WrongStatus(Status.Registered, a.status);
        a.lockupEnds = uint64(block.timestamp) + lockupPeriod;
        a.status = Status.Minted;
        emit MintConfirmed(assetId, a.lockupEnds);
    }

    /// Permissionless once the lockup has elapsed. Opens trading by granting the token's KYC to the
    /// SaucerSwap pair (the only contract that must hold the token; see the market wiring).
    function finalize(uint256 assetId, address pair) external {
        Asset storage a = _asset(assetId);
        if (a.status != Status.Minted) revert WrongStatus(Status.Minted, a.status);
        if (block.timestamp < a.lockupEnds) revert LockupActive(a.lockupEnds);
        if (pair == address(0)) revert ZeroAddress();
        a.status = Status.Finalized;
        _grantKyc(a.token, pair);
        emit Finalized(assetId, pair);
    }

    /// A verified investor opts into a finalized asset and receives token KYC. `msg.sender` is the
    /// caller's alias EVM address, which is exactly what HTS grantTokenKyc expects (see spike S4).
    function enableAsset(uint256 assetId) external {
        Asset storage a = _asset(assetId);
        if (a.status != Status.Finalized) revert NotFinalized();
        if (!investors.isVerified(msg.sender)) revert NotVerifiedInvestor();
        _grantKyc(a.token, msg.sender);
        emit AssetEnabled(assetId, msg.sender);
    }

    // --------------------------------------------------------------------- guardian emergency stop

    function pause(uint256 assetId) external onlyGuardian {
        _check(hts.pauseToken(_asset(assetId).token));
        emit Paused(assetId);
    }

    function unpause(uint256 assetId) external onlyGuardian {
        _check(hts.unpauseToken(_asset(assetId).token));
        emit Unpaused(assetId);
    }

    // --------------------------------------------------------------------- views

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    function getAsset(uint256 assetId) external view returns (Asset memory) {
        return _asset(assetId);
    }

    // --------------------------------------------------------------------- internal

    function _asset(uint256 assetId) private view returns (Asset storage) {
        if (assetId >= assets.length) revert UnknownAsset();
        return assets[assetId];
    }

    function _grantKyc(address token, address account) private {
        _check(hts.grantTokenKyc(token, account));
    }

    function _check(int64 responseCode) private pure {
        if (responseCode != HTS_SUCCESS) revert HtsError(responseCode);
    }
}
