import * as path from "node:path";
import { execFileSync } from "node:child_process";

export function assertZipEntriesSafe(zipPath: string): void {
    let listing = "";
    try {
        listing = execFileSync("unzip", ["-Z", "-1", zipPath], {
            stdio: ["ignore", "pipe", "pipe"],
            encoding: "utf8",
        });
    } catch (e: any) {
        throw new Error(`Failed to inspect zip: ${e.message}`);
    }

    for (const rawEntry of listing.split(/\r?\n/)) {
        const entry = rawEntry.trim();
        if (!entry) continue;
        const unixEntry = entry.replace(/\\/g, "/");
        const normalized = path.posix.normalize(unixEntry);

        if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:/.test(unixEntry)) {
            throw new Error(`Zip contains unsafe entry: ${entry}`);
        }
        if (normalized === ".." || normalized.startsWith("../")) {
            throw new Error(`Zip contains unsafe entry: ${entry}`);
        }
    }
}

export function assertZipMaxDepth(zipPath: string, maxDepth = 5): void {
    let listing = "";
    try {
        listing = execFileSync("unzip", ["-Z", "-1", zipPath], {
            stdio: ["ignore", "pipe", "pipe"],
            encoding: "utf8",
        });
    } catch (e: any) {
        throw new Error(`Failed to inspect zip: ${e.message}`);
    }

    for (const rawEntry of listing.split(/\r?\n/)) {
        const entry = rawEntry.trim();
        if (!entry) continue;
        const unixEntry = entry.replace(/\\/g, "/");
        const normalized = path.posix.normalize(unixEntry).replace(/^\.\//, "");
        const depth = normalized.split("/").filter(Boolean).length;
        if (depth > maxDepth) {
            throw new Error(`Zip exceeds max depth: ${entry}`);
        }
    }
}
