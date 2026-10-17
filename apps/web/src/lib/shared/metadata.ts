import { keccak256, toBytes } from "viem";
import { z } from "zod";
import { PROJECT_CATEGORIES } from "./constants";

const text = (max: number) => z.string().trim().max(max);

export const productSchema = z.object({
  name: text(120).min(1),
  description: text(2000).default(""),
  imageUrl: z.url().max(500).optional(),
});

export const merchantProfileSchema = z.object({
  name: text(120).min(1),
  description: text(1000).default(""),
  website: z.url().max(300).optional(),
});

export const charityProfileSchema = z.object({
  name: text(120).min(1),
  description: text(1000).default(""),
  registrationNo: text(60).optional(),
  website: z.url().max(300).optional(),
});

export const projectSchema = z.object({
  title: text(160).min(1),
  summary: text(2000).min(1),
  category: z.enum(PROJECT_CATEGORIES),
  location: text(120).optional(),
  usage: text(1500).optional(),
});

export const noteSchema = z.object({
  text: text(1000).min(1),
});

export const metadataSchemas = {
  product: productSchema,
  "merchant-profile": merchantProfileSchema,
  "charity-profile": charityProfileSchema,
  project: projectSchema,
  note: noteSchema,
} as const;

export type MetadataKind = keyof typeof metadataSchemas | "impact-report";
export type ProductMeta = z.infer<typeof productSchema>;
export type MerchantProfileMeta = z.infer<typeof merchantProfileSchema>;
export type CharityProfileMeta = z.infer<typeof charityProfileSchema>;
export type ProjectMeta = z.infer<typeof projectSchema>;

/** Deterministic JSON: object keys sorted, undefined dropped. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function hashMetadata(kind: MetadataKind, data: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalize({ kind, data })));
}
