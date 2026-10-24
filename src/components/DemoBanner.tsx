interface DemoBannerProps {
  isDemo: boolean;
}

export function DemoBanner({ isDemo }: DemoBannerProps) {
  if (!isDemo) return null;

  return (
    <div
      className="w-full bg-orange-500 px-4 py-3 text-center text-sm font-semibold text-white"
      role="alert"
    >
      DEMO DATA — This batch uses fictional sample data and does not represent a real supplier or
      product.
    </div>
  );
}
