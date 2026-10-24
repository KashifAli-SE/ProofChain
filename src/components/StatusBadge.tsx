import type { Status } from '@/lib/status';

interface StatusBadgeProps {
  status: Status | string;
  className?: string;
}

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ANALYZING: 'bg-blue-100 text-blue-700 animate-pulse',
  NEEDS_EVIDENCE: 'bg-yellow-100 text-yellow-700',
  IN_REVIEW: 'bg-indigo-100 text-indigo-700',
  VERIFIED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  RECHECK_REQUIRED: 'bg-orange-100 text-orange-700',
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colorClasses = STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClasses} ${className}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
