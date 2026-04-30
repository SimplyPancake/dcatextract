import formidable from 'formidable';
import { IncomingMessage } from "http";
import { fileQueue } from '../utils/queues';
import { getRedis } from '../utils/redis';


export default defineEventHandler(async (event) => {
    const req = event.node.req as IncomingMessage;
    const form = formidable({
        multiples: false,
        maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
        allowEmptyFiles: false,
        keepExtensions: true
    });

    const files = await new Promise<formidable.Files>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });
    const userFiles = files['uploadedZip'] as formidable.File[] | undefined
    if (!userFiles) {
        throw createError({
            statusCode: 500,
            statusMessage: 'No files provided',
            message: `No files were provided`
        })
    }

    const file = userFiles[0]!

    const redis = getRedis()
    const sessionId = event.context.sessionId
    if (!sessionId) {
        throw createError({
            statusCode: 401,
            statusMessage: 'No session',
            message: 'Session required'
        })
    }
    // Store file ownership in Redis
    await redis.sadd(
        `session:${sessionId}:files`,
        file.filepath
    )

    await fileQueue.add('process-file', {
        sessionId,
        filepath: file.filepath
    })

    return { success: true, files };
})