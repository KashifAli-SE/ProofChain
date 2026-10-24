// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ProofChainRegistry} from "../contracts/ProofChainRegistry.sol";

/// @notice Deploy ProofChainRegistry to the configured network.
///
/// Local (Anvil):
///   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// Sepolia:
///   forge script script/Deploy.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
contract DeployProofChain is Script {
    function run() external returns (ProofChainRegistry registry) {
        vm.startBroadcast();

        registry = new ProofChainRegistry();
        console2.log("ProofChainRegistry deployed to:", address(registry));

        // If a RECORDER_PRIVATE_KEY is set and it differs from the deployer,
        // grant it recorder rights immediately.
        uint256 recorderKey = vm.envOr("RECORDER_PRIVATE_KEY", uint256(0));
        if (recorderKey != 0) {
            address recorderAddr = vm.addr(recorderKey);
            if (recorderAddr != registry.owner()) {
                registry.setRecorder(recorderAddr, true);
                console2.log("Recorder granted to:", recorderAddr);
            }
        }

        vm.stopBroadcast();

        console2.log("\nAdd to .env.local:");
        console2.log(string.concat("REGISTRY_ADDRESS=", vm.toString(address(registry))));
    }
}
