import formidable from 'formidable';
import { IncomingMessage } from "http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getRedis } from '../utils/redis';
import { extractFileText } from '../workers/file-processor/helpers';


export default defineEventHandler(async (event) => {
    const req = event.node.req as IncomingMessage;
    const contentLengthHeader = req.headers["content-length"]
    const expectedBytes = contentLengthHeader
        ? BigInt(Number(contentLengthHeader))
        : null
    const form = formidable({
        multiples: true,
        maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
        allowEmptyFiles: false,
        keepExtensions: true
    });

    if (expectedBytes !== null && expectedBytes > 0n) {
        const stats = await fs.statfs(process.cwd())
        const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize)
        if (expectedBytes > freeBytes) {
            throw createError({
                statusCode: 507,
                statusMessage: 'Insufficient storage',
                message: 'Not enough disk space to store uploaded files'
            })
        }
    }

    const files = await new Promise<formidable.Files>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });
    const uploaded = files['uploadedFiles'] as formidable.File[] | formidable.File | undefined
    const userFiles = Array.isArray(uploaded) ? uploaded : uploaded ? [uploaded] : []
    if (userFiles.length === 0) {
        throw createError({
            statusCode: 500,
            statusMessage: 'No files provided',
            message: `No files were provided`
        })
    }

    const totalBytes = userFiles.reduce(
        (sum, file) => sum + BigInt(file.size ?? 0),
        0n
    )
    const firstFilePath = userFiles[0]?.filepath
    if (expectedBytes === null && firstFilePath && totalBytes > 0n) {
        const stats = await fs.statfs(path.dirname(firstFilePath))
        const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize)
        if (totalBytes > freeBytes) {
            throw createError({
                statusCode: 507,
                statusMessage: 'Insufficient storage',
                message: 'Not enough disk space to store uploaded files'
            })
        }
    }

    // Check if all files return anything
    let noContains = []
    for (const file of userFiles) {
        const fileText = await extractFileText(file.filepath, 100)
        console.log(fileText)
        if (fileText == '') {
            noContains.push(file.originalFilename)
        }
    }

    if (noContains.length > 0) {
        throw createError({
            statusCode: 507,
            statusMessage: 'No content',
            message: `Your file(s) do not contain content: ${noContains.join(', ')}`
        })
    }

    const redis = getRedis()
    const sessionId = event.context.sessionId
    if (!sessionId) {
        throw createError({
            statusCode: 401,
            statusMessage: 'No session',
            message: 'Session required'
        })
    }
    const previousUnprocessed = await redis.smembers(
        `session:${sessionId}:files:unprocessed`
    )
    if (previousUnprocessed.length > 0) {
        await redis.sadd(
            `session:${sessionId}:files:stopped`,
            ...previousUnprocessed
        )
        await redis.srem(
            `session:${sessionId}:files:unprocessed`,
            ...previousUnprocessed
        )

        await redis.hdel(
            `session:${sessionId}:files:original-names`,
            ...previousUnprocessed
        )
    }
    // Store file ownership in Redis (unprocessed queue)
    const filepaths = userFiles.map((file) => file.filepath);
    const originalNameEntries = userFiles
        .map((file) => {
            const originalName = file.originalFilename ?? undefined;
            return originalName ? [file.filepath, originalName] : null;
        })
        .filter((entry): entry is [string, string] => entry !== null);
    
    await redis.sadd(
        `session:${sessionId}:files:unprocessed`,
        ...filepaths
    )
    if (originalNameEntries.length > 0) {
        await redis.hset(
            `session:${sessionId}:files:original-names`,
            ...originalNameEntries.flat()
        )
    }

    return { success: true, files };
})