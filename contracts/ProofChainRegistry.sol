// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ProofChainRegistry
/// @notice Append-only registry of verification record hashes per batch.
/// @dev Stores integrity data only. It does NOT prove that any underlying
///      sustainability claim is true, only that a recorded hash and status
///      existed at a given time and have not been changed since.
contract ProofChainRegistry {
    /// @dev Order MUST match STATUSES in src/lib/status.ts.
    enum Status {
        DRAFT,
        ANALYZING,
        NEEDS_EVIDENCE,
        IN_REVIEW,
        VERIFIED,
        REJECTED,
        RECHECK_REQUIRED
    }

    struct Record {
        bytes32 recordHash;
        Status status;
        address recorder;
        uint64 timestamp;
    }

    address public owner;
    mapping(address => bool) public isRecorder;

    mapping(bytes32 => Record[]) private _records;
    mapping(bytes32 => mapping(bytes32 => bool)) private _seen;

    event VerificationRecorded(
        bytes32 indexed batchId,
        bytes32 indexed recordHash,
        Status status,
        uint256 index,
        address recorder,
        uint256 timestamp
    );
    event RecorderUpdated(address indexed account, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotRecorder();
    error ZeroHash();
    error ZeroAddress();
    error StatusNotRecordable();
    error DuplicateRecord();
    error IndexOutOfRange();
    error NoRecords();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRecorder() {
        if (!isRecorder[msg.sender]) revert NotRecorder();
        _;
    }

    constructor() {
        owner = msg.sender;
        isRecorder[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RecorderUpdated(msg.sender, true);
    }

    function setRecorder(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isRecorder[account] = allowed;
        emit RecorderUpdated(account, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @param batchId   keccak256(utf8(batch_code))
    /// @param recordHash keccak256 of the canonical verification record
    /// @param status    one of NEEDS_EVIDENCE, VERIFIED, REJECTED, RECHECK_REQUIRED
    /// @return index    position of the new record in the batch history
    function recordVerification(bytes32 batchId, bytes32 recordHash, Status status)
        external
        onlyRecorder
        returns (uint256 index)
    {
        if (batchId == bytes32(0) || recordHash == bytes32(0)) revert ZeroHash();
        if (
            status != Status.NEEDS_EVIDENCE &&
            status != Status.VERIFIED &&
            status != Status.REJECTED &&
            status != Status.RECHECK_REQUIRED
        ) revert StatusNotRecordable();
        if (_seen[batchId][recordHash]) revert DuplicateRecord();

        _seen[batchId][recordHash] = true;
        index = _records[batchId].length;
        _records[batchId].push(
            Record({
                recordHash: recordHash,
                status: status,
                recorder: msg.sender,
                timestamp: uint64(block.timestamp)
            })
        );

        emit VerificationRecorded(batchId, recordHash, status, index, msg.sender, block.timestamp);
    }

    function getRecordCount(bytes32 batchId) external view returns (uint256) {
        return _records[batchId].length;
    }

    function getRecord(bytes32 batchId, uint256 index) external view returns (Record memory) {
        if (index >= _records[batchId].length) revert IndexOutOfRange();
        return _records[batchId][index];
    }

    function getLatest(bytes32 batchId) external view returns (Record memory) {
        uint256 n = _records[batchId].length;
        if (n == 0) revert NoRecords();
        return _records[batchId][n - 1];
    }

    function isRecorded(bytes32 batchId, bytes32 recordHash) external view returns (bool) {
        return _seen[batchId][recordHash];
    }
}
