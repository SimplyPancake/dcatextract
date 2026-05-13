import { z } from "zod";
import { queryModel } from "../../utils/ai";

const descriptionSchema = z.object({
  description: z.string().describe("A comprehensive summary and description of the dataset suitable for a DCAT catalog field.")
});

const distributionMetadataSchema = z.object({
  licenseIri: z.string().nullable().optional().describe("SPDX or license IRI when explicitly stated, otherwise null."),
  rights: z.string().nullable().optional().describe("Rights statement if explicitly present, otherwise null."),
  languageIri: z.string().nullable().optional().describe("Language IRI when explicitly stated, otherwise null."),
  conformsToIri: z.string().nullable().optional().describe("Standard IRI if explicitly stated, otherwise null."),
  temporalStart: z.string().nullable().optional().describe("Temporal coverage start date if explicit, otherwise null."),
  temporalEnd: z.string().nullable().optional().describe("Temporal coverage end date if explicit, otherwise null."),
  temporalResolution: z.string().nullable().optional().describe("Temporal resolution duration if explicit, otherwise null."),
  spatialResolutionInMeters: z.number().nullable().optional().describe("Spatial resolution in meters if explicit, otherwise null."),
  spatialBboxWkt: z.string().nullable().optional().describe("Bounding box WKT if explicit, otherwise null."),
  spatialCentroidWkt: z.string().nullable().optional().describe("Centroid WKT if explicit, otherwise null."),
});

const customSchemaValues = z.object({
  values: z.record(z.string(), z.string().nullable()),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
});

// TODO: Handle AI refusal etc

export async function processDCATDescription(fileContent: string, filePath?: string): Promise<string> {
  const config = useRuntimeConfig()
  if (!config.useAi) {
    await new Promise(r => setTimeout(r, 1500));
    return "No description - Enable AI"

  }
  const systemPrompt = "You are an expert data cataloger. Analyze the provided file content or metadata and generate a clear, concise, and informative DCAT description for the dataset.";
  // Approximate 1 token = 3 characters roughly for dense data.
  // To keep total tokens well under the 4096 context window (say ~2000 tokens for text),
  // we trim to about 6000 characters. 
  // We can further reduce it to 4000 chars to be extremely safe, as some binary 
  // or PDF strings can take almost 1 token per char.
  const MAX_CHARS = 4000;
  
  const trimmedContent = fileContent.trim();
  if (!trimmedContent) {
    return "";
  }

  const userPrompt = `Please generate a DCAT description field based on the following file content/metadata:\n\n${trimmedContent.slice(0, MAX_CHARS)}`;

  try {
    const result = await queryModel(
      systemPrompt,
      userPrompt,
      descriptionSchema
    );

    return result.description;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`DCAT description generation failed: ${message}`);
    return "";
  }
}

export async function processDistributionMetadata(fileContent: string, fileName?: string): Promise<z.infer<typeof distributionMetadataSchema>> {
  const config = useRuntimeConfig()
  if (!config.useAi) {
    await new Promise(r => setTimeout(r, 1500));
    return {
      licenseIri: null,
      rights: null,
      languageIri: null,
      conformsToIri: null,
      temporalStart: null,
      temporalEnd: null,
      temporalResolution: null,
      spatialResolutionInMeters: null,
      spatialBboxWkt: null,
      spatialCentroidWkt: null,
    };
  }

  const systemPrompt = "You are an expert data cataloger. Extract distribution metadata only when it is explicitly stated. If not explicit, return null. Do not guess or infer.";
  const MAX_CHARS = 4000;
  const trimmedContent = fileContent.trim();
  if (!trimmedContent) {
    return {
      licenseIri: null,
      rights: null,
      languageIri: null,
      conformsToIri: null,
      temporalStart: null,
      temporalEnd: null,
      temporalResolution: null,
      spatialResolutionInMeters: null,
      spatialBboxWkt: null,
      spatialCentroidWkt: null,
    };
  }

  const nameHint = fileName ? `File name: ${fileName}\n` : "";
  const userPrompt = `${nameHint}Extract DCAT Distribution metadata fields from the following content. If a field is not explicitly stated, return null.\n\n${trimmedContent.slice(0, MAX_CHARS)}`;

  try {
    return await queryModel(
      systemPrompt,
      userPrompt,
      distributionMetadataSchema
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`Distribution metadata generation failed: ${message}`);
    return {
      licenseIri: null,
      rights: null,
      languageIri: null,
      conformsToIri: null,
      temporalStart: null,
      temporalEnd: null,
      temporalResolution: null,
      spatialResolutionInMeters: null,
      spatialBboxWkt: null,
      spatialCentroidWkt: null,
    };
  }
}

export async function processCustomSchemaProperties(
  fileContent: string,
  properties: string[],
  fileName?: string
): Promise<z.infer<typeof customSchemaValues>> {
  const config = useRuntimeConfig();
  if (!config.useAi || properties.length === 0) {
    const emptyValues = Object.fromEntries(properties.map((prop) => [prop, null]));
    const emptyConfidence = Object.fromEntries(properties.map((prop) => [prop, 0]));
    return {
      values: emptyValues,
      confidence: emptyConfidence,
    };
  }

  const MAX_CHARS = 4000;
  const trimmedContent = fileContent.trim();
  if (!trimmedContent) {
    const emptyValues = Object.fromEntries(properties.map((prop) => [prop, null]));
    const emptyConfidence = Object.fromEntries(properties.map((prop) => [prop, 0]));
    return {
      values: emptyValues,
      confidence: emptyConfidence,
    };
  }

  const nameHint = fileName ? `File name: ${fileName}\n` : "";
  const systemPrompt = "You are an expert data cataloger. Extract values only when explicitly stated. If not explicit, return null. Provide confidence 0 to 1 for each property.";
  const userPrompt = `${nameHint}Extract custom schema properties from the following content.\n\nProperties:\n${properties.join("\n")}\n\nContent:\n${trimmedContent.slice(0, MAX_CHARS)}`;

  try {
    const result = await queryModel(systemPrompt, userPrompt, customSchemaValues);
    const normalizedValues = Object.fromEntries(properties.map((prop) => [prop, result.values[prop] ?? null]));
    const normalizedConfidence = Object.fromEntries(properties.map((prop) => [prop, result.confidence[prop] ?? 0]));
    return {
      values: normalizedValues,
      confidence: normalizedConfidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`Custom schema extraction failed: ${message}`);
    const emptyValues = Object.fromEntries(properties.map((prop) => [prop, null]));
    const emptyConfidence = Object.fromEntries(properties.map((prop) => [prop, 0]));
    return {
      values: emptyValues,
      confidence: emptyConfidence,
    };
  }
}
