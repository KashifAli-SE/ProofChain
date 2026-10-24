import type { CarbonResult } from '@/lib/agents/schemas';

interface CarbonPanelProps {
  carbon: CarbonResult;
}

export function CarbonPanel({ carbon }: CarbonPanelProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Carbon Footprint
      </h2>

      {carbon.factor_status === 'ILLUSTRATIVE_FACTORS' && (
        <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 p-3">
          <p className="text-sm font-medium text-yellow-800">
            ⚠ Illustrative factors — these emission factors are placeholders and have not been
            verified against a cited source. Do not use these numbers for reporting.
          </p>
        </div>
      )}

      <div className="mb-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="pb-2 pr-4">Kind</th>
              <th className="pb-2 pr-4">Quantity</th>
              <th className="pb-2 pr-4">Unit</th>
              <th className="pb-2 pr-4">Factor ID</th>
              <th className="pb-2 pr-4">Factor value</th>
              <th className="pb-2 pr-4">Source</th>
              <th className="pb-2">kgCO₂e</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {carbon.lines.map((line) => (
              <tr key={line.id} className="text-gray-700">
                <td className="py-2 pr-4 font-medium">{line.kind}</td>
                <td className="py-2 pr-4">
                  {line.quantity != null ? line.quantity.toLocaleString() : '—'}
                </td>
                <td className="py-2 pr-4">{line.unit}</td>
                <td className="py-2 pr-4 font-mono text-xs">{line.factor_id ?? '—'}</td>
                <td className="py-2 pr-4">
                  {line.factor_value != null
                    ? `${line.factor_value} ${line.factor_unit ?? ''}`
                    : '—'}
                </td>
                <td className="py-2 pr-4 max-w-xs truncate text-xs text-gray-500">
                  {line.factor_source ?? '—'}
                </td>
                <td className="py-2">
                  {line.kgco2e != null ? (
                    <span className="font-medium">{line.kgco2e.toLocaleString()} kgCO₂e</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 text-sm">
        <div>
          <dt className="font-medium text-gray-500">Total</dt>
          <dd className="text-gray-900">
            {carbon.total_kgco2e != null
              ? `${carbon.total_kgco2e.toLocaleString()} kgCO₂e`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Per unit</dt>
          <dd className="text-gray-900">
            {carbon.kgco2e_per_unit != null
              ? `${carbon.kgco2e_per_unit.toLocaleString()} kgCO₂e / unit`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Completeness</dt>
          <dd className="text-gray-900">{carbon.completeness}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Factors</dt>
          <dd className="text-gray-900">{carbon.factor_status.replace('_', ' ')}</dd>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          Boundary
        </h3>
        <p className="text-sm text-gray-700">{carbon.boundary}</p>
      </div>

      {carbon.assumptions.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Assumptions
          </h3>
          <ul className="space-y-1 text-sm text-gray-700">
            {carbon.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gray-400">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {carbon.limitations.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Limitations
          </h3>
          <ul className="space-y-1 text-sm text-gray-700">
            {carbon.limitations.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gray-400">•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
