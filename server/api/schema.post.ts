import formidable from "formidable";
import { IncomingMessage } from "http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getRedis } from "../utils/redis";
import { analyzeTurtleSchema } from "../utils/schema";
import type { SchemaStoreResponse } from "~~/shared/types/schema";

const MAX_SCHEMA_BYTES = 5 * 1024 * 1024;

export default defineEventHandler(async (event) => {
  const sessionId = event.context.sessionId;
  if (!sessionId) {
    throw createError({
      statusCode: 401,
      statusMessage: "No session",
      message: "Session required",
    });
  }

  const req = event.node.req as IncomingMessage;
  const form = formidable({
    multiples: false,
    maxFileSize: MAX_SCHEMA_BYTES,
    allowEmptyFiles: true,
    keepExtensions: true,
  });

  const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const schemaTextField = fields.schemaText as string | string[] | undefined;
  const customPropertiesField = fields.customProperties as string | string[] | undefined;
  const clear = fields.clear?.toString() === "1";
  const schemaText = Array.isArray(schemaTextField)
    ? schemaTextField.join("\n")
    : schemaTextField?.toString() ?? "";

  const customPropertiesRaw = Array.isArray(customPropertiesField)
    ? customPropertiesField.join("\n")
    : customPropertiesField?.toString();
  let customProperties: string[] | null = null;
  if (customPropertiesRaw) {
    try {
      const parsed = JSON.parse(customPropertiesRaw);
      if (Array.isArray(parsed)) {
        customProperties = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    } catch {
      customProperties = customPropertiesRaw
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  const schemaFile = files.schemaFile as formidable.File | formidable.File[] | undefined;
  const upload = Array.isArray(schemaFile) ? schemaFile[0] ?? null : schemaFile ?? null;
  let fileText = "";

  if (upload) {
    const name = upload.originalFilename ?? upload.filepath;
    if (path.extname(name).toLowerCase() !== ".ttl") {
      throw createError({
        statusCode: 415,
        statusMessage: "Unsupported schema format",
        message: "Only Turtle (.ttl) files are supported.",
      });
    }
    fileText = await fs.readFile(upload.filepath, "utf8");
  }

  const redis = getRedis();
  let combined = clear ? "" : [schemaText, fileText].filter(Boolean).join("\n").trim();
  if (!combined && customProperties && !clear) {
    combined = (await redis.get(`session:${sessionId}:schema:turtle`)) ?? "";
  }

  if (!combined) {
    await redis.del(`session:${sessionId}:schema:turtle`);
    await redis.del(`session:${sessionId}:schema:analysis`);
    const response: SchemaStoreResponse = {
      stored: false,
      message: "Schema cleared",
    };
    return response;
  }

  const analysis = analyzeTurtleSchema(combined);
  if (customProperties) {
    analysis.customProperties = [...new Set(customProperties)];
  }

  await redis.set(`session:${sessionId}:schema:turtle`, combined);
  await redis.set(`session:${sessionId}:schema:analysis`, JSON.stringify(analysis));

  const response: SchemaStoreResponse = {
    stored: true,
    analysis,
  };

  return response;
});
