import { z } from "zod";

export interface SchemaAnalysis {
  usesDcat: boolean
  dcatKeys: string[]
  dcatIris: string[]
  customProperties: CustomProperty[]   // was: string[]
  classHints: string[]
}

export type SchemaStoreResponse = {
  stored: boolean;
  analysis?: SchemaAnalysis;
  message?: string;
};

export const CustomPropertyContextSchema = z.enum([
  "dataset",
  "distribution",
  "dataService",
  "catalogRecord",
]);

export const CustomPropertySchema = z.object({
  iri: z.string(),
  context: CustomPropertyContextSchema,
});

export type CustomPropertyContext = z.infer<typeof CustomPropertyContextSchema>;

export type CustomProperty = z.infer<typeof CustomPropertySchema>;