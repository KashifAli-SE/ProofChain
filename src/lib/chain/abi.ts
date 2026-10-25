export const REGISTRY_ABI = [
  'function recordVerification(bytes32 batchId, bytes32 recordHash, uint8 status) returns (uint256)',
  'function getRecordCount(bytes32 batchId) view returns (uint256)',
  'function getLatest(bytes32 batchId) view returns (tuple(bytes32 recordHash, uint8 status, address recorder, uint64 timestamp))',
  'function getRecord(bytes32 batchId, uint256 index) view returns (tuple(bytes32 recordHash, uint8 status, address recorder, uint64 timestamp))',
  'function isRecorded(bytes32 batchId, bytes32 recordHash) view returns (bool)',
  'function isRecorder(address) view returns (bool)',
  'event VerificationRecorded(bytes32 indexed batchId, bytes32 indexed recordHash, uint8 status, uint256 index, address recorder, uint256 timestamp)',
] as const;
