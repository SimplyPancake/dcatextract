import formidable from 'formidable';
import { IncomingMessage } from "http";
import { fileQueue } from '../utils/queues';
import { getRedis } from '../utils/redis';


export default defineEventHandler(async (event) => {
    const req = event.node.req as IncomingMessage;
    const form = formidable({
        multiples: true,
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
    const uploaded = files['uploadedFiles'] as formidable.File[] | formidable.File | undefined
    const userFiles = Array.isArray(uploaded) ? uploaded : uploaded ? [uploaded] : []
    if (userFiles.length === 0) {
        throw createError({
            statusCode: 500,
            statusMessage: 'No files provided',
            message: `No files were provided`
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
    // Store file ownership in Redis (unprocessed queue)
    const filepaths = userFiles.map((file) => file.filepath);
    
    await redis.sadd(
        `session:${sessionId}:files:unprocessed`,
        ...filepaths
    )

    await fileQueue.add('process-session', {
        sessionId,
        filepaths
    })

    return { success: true, files };
})