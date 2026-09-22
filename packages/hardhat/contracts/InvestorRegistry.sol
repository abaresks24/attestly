// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Records investors an admin has verified off-chain (KYC/AML happens off-chain; this only stores the
/// result). Membership gates per-asset KYC enablement in {AssetRegistry}. Kept deliberately small: the
/// interesting compliance work is done by Hedera's native token keys, not by this list.
contract InvestorRegistry {
    address public admin;
    mapping(address => bool) public isVerified;

    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event InvestorApproved(address indexed investor);
    event InvestorRevoked(address indexed investor);

    error NotAdmin();
    error ZeroAddress();

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function approve(address investor) external onlyAdmin {
        isVerified[investor] = true;
        emit InvestorApproved(investor);
    }

    function revoke(address investor) external onlyAdmin {
        isVerified[investor] = false;
        emit InvestorRevoked(investor);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
