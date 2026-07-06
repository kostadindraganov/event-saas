import { z } from "zod";

export const AttributeOptionSchema = z.object({
  value: z.string(),
  labelBg: z.string(),
  labelEn: z.string(),
});

export const AttributeDefinitionDTOSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  labelBg: z.string(),
  labelEn: z.string(),
  type: z.enum(["single", "multi", "number", "boolean"]),
  options: z.array(AttributeOptionSchema).nullable(),
  showAsFilter: z.boolean(),
  showAsChip: z.boolean(),
  sortOrder: z.number().int(),
});
export type AttributeDefinitionDTO = z.infer<typeof AttributeDefinitionDTOSchema>;

export const AttributeValueInputSchema = z.object({
  definitionId: z.uuid(),
  value: z.union([z.boolean(), z.number(), z.string(), z.array(z.string())]),
});
export type AttributeValueInput = z.infer<typeof AttributeValueInputSchema>;

export const SetAttributeValuesInputSchema = z.object({
  listingId: z.uuid(),
  values: z.array(AttributeValueInputSchema).max(50),
});
