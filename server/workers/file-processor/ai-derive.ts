import { z } from "zod";
import { queryModel } from "../../utils/ai";

const descriptionSchema = z.object({
  description: z.string().describe("A comprehensive summary and description of the dataset suitable for a DCAT catalog field.")
});

// TODO: Handle AI refusal etc

export async function processDCATDescription(fileContent: string): Promise<string> {
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
