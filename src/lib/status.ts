export const STATUSES = [
  'DRAFT',
  'ANALYZING',
  'NEEDS_EVIDENCE',
  'IN_REVIEW',
  'VERIFIED',
  'REJECTED',
  'RECHECK_REQUIRED',
] as const;

export type Status = (typeof STATUSES)[number];

export const statusToChain = (s: Status) => STATUSES.indexOf(s); // matches Solidity enum order

export const RECORDABLE: Status[] = [
  'NEEDS_EVIDENCE',
  'VERIFIED',
  'REJECTED',
  'RECHECK_REQUIRED',
];
