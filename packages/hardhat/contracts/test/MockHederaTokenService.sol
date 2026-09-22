// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Test-only stand-in for the HTS precompile. The local Hardhat network has no system contract at
/// 0x167, so unit tests inject this mock into {AssetRegistry}. It records calls and returns SUCCESS (22).
contract MockHederaTokenService {
    int64 private constant SUCCESS = 22;

    mapping(address => mapping(address => bool)) public kycGranted;
    mapping(address => bool) public paused;

    function grantTokenKyc(address token, address account) external returns (int64) {
        kycGranted[token][account] = true;
        return SUCCESS;
    }

    function revokeTokenKyc(address token, address account) external returns (int64) {
        kycGranted[token][account] = false;
        return SUCCESS;
    }

    function pauseToken(address token) external returns (int64) {
        paused[token] = true;
        return SUCCESS;
    }

    function unpauseToken(address token) external returns (int64) {
        paused[token] = false;
        return SUCCESS;
    }
}
