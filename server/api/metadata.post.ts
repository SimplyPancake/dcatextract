import formidable from 'formidable';
import { IncomingMessage } from "http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getRedis } from '../utils/redis';
import { queuePreviousMetadataFilesForStop } from '../utils/files';
const MB = 1024 * 1024

export default defineEventHandler(async (event) => {
	const req = event.node.req as IncomingMessage;
	const contentLengthHeader = req.headers["content-length"]
	const expectedBytes = contentLengthHeader
		? BigInt(Number(contentLengthHeader))
		: null
	const form = formidable({
		multiples: true,
		maxFileSize: 50 * MB,
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
	const uploaded = files['metadataFiles'] as formidable.File[] | formidable.File | undefined
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


	const redis = getRedis()
	const sessionId = event.context.sessionId
	if (!sessionId) {
		throw createError({
			statusCode: 401,
			statusMessage: 'No session',
			message: 'Session required'
		})
	}
	
	await queuePreviousMetadataFilesForStop(sessionId)

	const filepaths = userFiles.map((file) => file.filepath)
	// Queue metadata for session
	await redis.sadd(
		`session:${sessionId}:metadata:queued`,
		filepaths
	)

	return { success: true, files };
})