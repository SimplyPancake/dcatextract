import formidable from 'formidable';
import { IncomingMessage } from "http";


export default defineEventHandler(async (event) => {
    const req = event.node.req as IncomingMessage;
    const form = formidable({
        multiples: false,
        maxFileSize: 2 * 1024 * 1024 * 1024 // 2GB
    });

    const files = await new Promise<formidable.Files>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });

    // Access uploaded file: files.<fieldName>
    // Move or process the file as needed
    console.log(files)

    const redis = useNitroApp().redis
    // Use lpush and rpop for FIFO
    // 'jobs:fileprocess' push 'userSession:filepath'
    redis.lPush('jobs:fileprocess', ``)
    // Then let redis know where the file is

    return { success: true, files };
})