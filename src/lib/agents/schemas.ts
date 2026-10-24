// Stub schema for ActivityData — FEAT-003 will add the full implementation.
import { z } from 'zod';

export const activityDataSchema = z.object({
  transportMode: z.string().optional(),
  distanceKm: z.number().optional(),
  weightKg: z.number().optional(),
  energyKwh: z.number().optional(),
  materialMix: z.record(z.number()).optional(),
  countryOfOrigin: z.string().optional(),
  countryOfManufacture: z.string().optional(),
}).passthrough(); // allow additional fields until FEAT-003 finalises the shape

export type ActivityData = z.infer<typeof activityDataSchema>;
