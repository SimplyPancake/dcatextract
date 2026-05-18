import { z } from "zod";
import { analyzeTurtleSchema } from "../utils/schema";
import type { SchemaStoreResponse } from "~~/shared/types/schema";

const bodySchema = z.object({
  schemaText: z.string().trim().min(1),
});

export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId;
  if (!sessionId) {
    throw createError({
      statusCode: 401,
      statusMessage: "No session",
      message: "Session required",
    });
  }

  const result = await readValidatedBody(event, body => bodySchema.safeParse(body));
  if (!result.success) {
    throw result.error.issues;
  }

  const { schemaText } = result.data;

  const analysis = analyzeTurtleSchema(schemaText);

  const response: SchemaStoreResponse = {
    stored: true,
    analysis,
  };

  return response;
});
