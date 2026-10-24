// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ProofChainRegistry} from "../contracts/ProofChainRegistry.sol";

contract ProofChainRegistryTest is Test {
    ProofChainRegistry internal registry;

    address internal owner   = address(this);
    address internal recorder = makeAddr("recorder");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant BATCH_ID = keccak256("TX-1042");
    bytes32 internal constant HASH_A   = keccak256("record-a");
    bytes32 internal constant HASH_B   = keccak256("record-b");

    function setUp() public {
        registry = new ProofChainRegistry();
    }

    // ── Deployment ────────────────────────────────────────────────────────────

    function test_DeployerIsOwnerAndRecorder() public view {
        assertEq(registry.owner(), owner);
        assertTrue(registry.isRecorder(owner));
    }

    // ── recordVerification ────────────────────────────────────────────────────

    function test_RecordVerification_EmitsEvent() public {
        vm.expectEmit(true, true, false, false, address(registry));
        emit ProofChainRegistry.VerificationRecorded(
            BATCH_ID, HASH_A, ProofChainRegistry.Status.VERIFIED, 0, owner, block.timestamp
        );
        uint256 idx = registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.VERIFIED);
        assertEq(idx, 0);
        assertEq(registry.getRecordCount(BATCH_ID), 1);
    }

    function test_RecordVerification_HistoryOrder() public {
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.NEEDS_EVIDENCE);
        registry.recordVerification(BATCH_ID, HASH_B, ProofChainRegistry.Status.VERIFIED);

        assertEq(registry.getRecordCount(BATCH_ID), 2);
        assertEq(registry.getRecord(BATCH_ID, 0).recordHash, HASH_A);
        assertEq(registry.getLatest(BATCH_ID).recordHash, HASH_B);
    }

    function test_RecordVerification_LatestIsNewest() public {
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.NEEDS_EVIDENCE);
        registry.recordVerification(BATCH_ID, HASH_B, ProofChainRegistry.Status.VERIFIED);
        assertEq(registry.getLatest(BATCH_ID).recordHash, HASH_B);
    }

    function test_RecordVerification_IsRecorded() public {
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.VERIFIED);
        assertTrue(registry.isRecorded(BATCH_ID, HASH_A));
        assertFalse(registry.isRecorded(BATCH_ID, HASH_B));
    }

    // ── Reverts ───────────────────────────────────────────────────────────────

    function test_RevertIf_DuplicateRecord() public {
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.REJECTED);
        vm.expectRevert(ProofChainRegistry.DuplicateRecord.selector);
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.REJECTED);
    }

    function test_RevertIf_NonRecordableStatus_Draft() public {
        vm.expectRevert(ProofChainRegistry.StatusNotRecordable.selector);
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.DRAFT);
    }

    function test_RevertIf_NonRecordableStatus_Analyzing() public {
        vm.expectRevert(ProofChainRegistry.StatusNotRecordable.selector);
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.ANALYZING);
    }

    function test_RevertIf_NonRecordableStatus_InReview() public {
        vm.expectRevert(ProofChainRegistry.StatusNotRecordable.selector);
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.IN_REVIEW);
    }

    function test_RevertIf_ZeroRecordHash() public {
        vm.expectRevert(ProofChainRegistry.ZeroHash.selector);
        registry.recordVerification(BATCH_ID, bytes32(0), ProofChainRegistry.Status.VERIFIED);
    }

    function test_RevertIf_ZeroBatchId() public {
        vm.expectRevert(ProofChainRegistry.ZeroHash.selector);
        registry.recordVerification(bytes32(0), HASH_A, ProofChainRegistry.Status.VERIFIED);
    }

    function test_RevertIf_NonRecorder() public {
        vm.prank(stranger);
        vm.expectRevert(ProofChainRegistry.NotRecorder.selector);
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.VERIFIED);
    }

    function test_RevertIf_GetLatest_Empty() public {
        vm.expectRevert(ProofChainRegistry.NoRecords.selector);
        registry.getLatest(BATCH_ID);
    }

    function test_RevertIf_GetRecord_OutOfRange() public {
        vm.expectRevert(ProofChainRegistry.IndexOutOfRange.selector);
        registry.getRecord(BATCH_ID, 0);
    }

    // ── Access control ────────────────────────────────────────────────────────

    function test_OwnerCanGrantAndRevokeRecorder() public {
        registry.setRecorder(recorder, true);
        vm.prank(recorder);
        registry.recordVerification(BATCH_ID, HASH_A, ProofChainRegistry.Status.VERIFIED);
        assertTrue(registry.isRecorded(BATCH_ID, HASH_A));

        registry.setRecorder(recorder, false);
        vm.prank(recorder);
        vm.expectRevert(ProofChainRegistry.NotRecorder.selector);
        registry.recordVerification(BATCH_ID, HASH_B, ProofChainRegistry.Status.VERIFIED);
    }

    function test_RevertIf_StrangerSetsRecorder() public {
        vm.prank(stranger);
        vm.expectRevert(ProofChainRegistry.NotOwner.selector);
        registry.setRecorder(stranger, true);
    }

    function test_RevertIf_StrangerTransfersOwnership() public {
        vm.prank(stranger);
        vm.expectRevert(ProofChainRegistry.NotOwner.selector);
        registry.transferOwnership(stranger);
    }

    function test_OwnershipTransfer() public {
        registry.transferOwnership(recorder);
        assertEq(registry.owner(), recorder);
    }

    function test_RevertIf_SetRecorder_ZeroAddress() public {
        vm.expectRevert(ProofChainRegistry.ZeroAddress.selector);
        registry.setRecorder(address(0), true);
    }

    function test_RevertIf_TransferOwnership_ZeroAddress() public {
        vm.expectRevert(ProofChainRegistry.ZeroAddress.selector);
        registry.transferOwnership(address(0));
    }
}
