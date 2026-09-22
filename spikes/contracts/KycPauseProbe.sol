// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// S4 probe: can a plain (non-proxy) contract hold a token's KYC key and pause key and drive
// them through the HTS system contract at 0x167? Each call bubbles the HTS response code and
// reverts with it when it is not SUCCESS (22), so failures are legible. Only the deployer may call.
//
// Uses the low-level precompile call pattern (the same one hedera's HederaTokenService.sol uses)
// rather than a typed interface call, because the HTS precompile is not a normal EVM contract.
contract KycPauseProbe {
    address constant HTS = address(0x167);
    int64 constant SUCCESS = 22;
    address public immutable deployer;

    error HtsError(int64 code);

    constructor() {
        deployer = msg.sender;
    }

    modifier onlyDeployer() {
        require(msg.sender == deployer, "not deployer");
        _;
    }

    function grantKyc(address token, address account) external onlyDeployer {
        _check(_call(abi.encodeWithSignature("grantTokenKyc(address,address)", token, account)));
    }

    function revokeKyc(address token, address account) external onlyDeployer {
        _check(_call(abi.encodeWithSignature("revokeTokenKyc(address,address)", token, account)));
    }

    function pause(address token) external onlyDeployer {
        _check(_call(abi.encodeWithSignature("pauseToken(address)", token)));
    }

    function unpause(address token) external onlyDeployer {
        _check(_call(abi.encodeWithSignature("unpauseToken(address)", token)));
    }

    function _call(bytes memory payload) private returns (int64 code) {
        (bool ok, bytes memory result) = HTS.call(payload);
        code = ok ? abi.decode(result, (int64)) : int64(-1);
    }

    function _check(int64 code) private pure {
        if (code != SUCCESS) revert HtsError(code);
    }
}
