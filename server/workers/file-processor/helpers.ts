import * as fs from "node:fs";
import * as path from "node:path";

export function titleFromStem(stem: string): string {
    return stem
        .replace(/[-_.]/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

export function readReadme(dir: string): string | null {
    for (const name of ["README.md", "README.txt", "readme.md", "readme.txt", "README"]) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
            try { return fs.readFileSync(p, "utf8").slice(0, 3000); } catch { /* ignore */ }
        }
    }
    return null;
}

export function mdTitle(md: string): string | null {
    return md.match(/^#+\s+(.+)/m)?.[1]?.trim() ?? null;
}

export function mdDescription(md: string): string | null {
    // First non-heading paragraph
    const paras: string[] = [];
    let inside = false;
    for (const line of md.split("\n")) {
        if (/^#+/.test(line)) { if (!inside && paras.length === 0) inside = true; continue; }
        if (line.trim() === "") { if (paras.length) break; continue; }
        paras.push(line.trim());
    }
    const out = paras.join(" ").trim();
    return out.length > 10 ? out.slice(0, 500) : null;
}

export function walk(dir: string, relative = "", maxDepth = 5): string[] {
    if (maxDepth <= 0) {
        return []
    }
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...walk(full, rel, maxDepth - 1));
        else results.push(rel);
    }
    return results;
}
