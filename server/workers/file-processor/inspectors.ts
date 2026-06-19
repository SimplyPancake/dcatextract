import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";
import type { Distribution } from "../../../shared/types/dcat3.js";

function baseDistribution(filePath: string): Distribution {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase().slice(1) || "unknown";
    const stats = fs.statSync(filePath);
    
    let preview = "";
    try {
        const head = fs.readFileSync(filePath, "utf8").slice(0, 500);
        // Extract printable strings, truncate to 200 chars
        preview = head.replace(/[^\x20-\x7E\n\t]/g, "").trim().slice(0, 200);
    } catch {
        // Binary file or read error, skip preview
    }
    
    return {
        accessURL: [filePath],
        title: fileName,
        format: ext,
        byteSize: stats.size,
        ...(preview && { description: preview }),
    };
}

function inspectCsv(filePath: string): Distribution {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) return baseDistribution(filePath);

        const firstLine = lines[0]!;
        const delimiter = firstLine.includes("\t") ? "\t"
            : firstLine.includes(";") ? ";"
                : ",";

        const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
        const rowCount = lines.length - 1;
        const geoHints = headers.filter(h =>
            /^(lat|latitude|lon|lng|longitude|x|y|geometry|geom|wkt|bbox)$/i.test(h)
        );

        const descriptionParts = [
            `Columns: ${headers.join(", ")}`,
            `Row count: ${rowCount}`,
            `Delimiter: ${delimiter === "\t" ? "tab" : delimiter}`,
        ];
        if (geoHints.length > 0) descriptionParts.push(`Geo columns: ${geoHints.join(", ")}`);

        return {
            ...baseDistribution(filePath),
            description: descriptionParts.join("; "),
        };
    } catch { return baseDistribution(filePath); }
}

function inspectJson(filePath: string): Distribution {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            return {
                ...baseDistribution(filePath),
                description: [
                    "JSON type: array",
                    `Item count: ${parsed.length}`,
                    `Keys: ${typeof parsed[0] === "object" && parsed[0] !== null ? Object.keys(parsed[0]).join(", ") : ""}`,
                ].join("; "),
            };
        }

        return { ...baseDistribution(filePath), description: `JSON type: ${typeof parsed}` };
    } catch { return baseDistribution(filePath); }
}

function inspectPdf(filePath: string): Distribution {
    try {
        const result = spawnSync("pdfinfo", [filePath], { encoding: "utf8" });
        if (result.status !== 0 || !result.stdout) return baseDistribution(filePath);
        const meta: Record<string, string> = {};
        for (const line of result.stdout.split("\n")) {
            const colonIdx = line.indexOf(":");
            if (colonIdx === -1) continue;
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim();
            if (val && ["Title", "Author", "Subject", "Keywords", "Creator", "Pages", "CreationDate", "ModDate"].includes(key)) {
                meta[key] = val;
            }
        }
        return {
            ...baseDistribution(filePath),
            title: meta.Title,
            description: meta.Subject,
        };
    } catch { return baseDistribution(filePath); }
}


function inspectXml(filePath: string): Distribution {
    try {
        const head = fs.readFileSync(filePath, "utf8").slice(0, 2000);
        const rootMatch = head.match(/<([a-zA-Z][a-zA-Z0-9_:.-]*)/);
        const nsMatches = [...head.matchAll(/xmlns(?::[^=]+)?="([^"]+)"/g)].map(m => m[1]);
        return {
            ...baseDistribution(filePath),
            description: `Root element: ${rootMatch?.[1] ?? "unknown"}; Namespaces: ${nsMatches.join(", ")}`,
        };
    } catch { return baseDistribution(filePath); }
}

function inspectXlsx(filePath: string): Distribution {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        if (sheetNames.length === 0) return baseDistribution(filePath);

        const firstSheetName = sheetNames[0];
        if (!firstSheetName) return baseDistribution(filePath);
        const firstSheet = workbook.Sheets[firstSheetName]!;
        const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];
        
        const headers = (data[0] as string[])?.map(h => String(h).trim()) ?? [];
        const rowCount = Math.max(0, data.length - 1);

        const descriptionParts = [
            `Sheets: ${sheetNames.join(", ")}`,
            `Active sheet: ${firstSheetName}`,
            `Columns: ${headers.join(", ")}`,
            `Row count: ${rowCount}`,
        ];

        return {
            ...baseDistribution(filePath),
            description: descriptionParts.join("; "),
        };
    } catch { return baseDistribution(filePath); }
}

function inspectTxt(filePath: string): Distribution {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const lineCount = content.split(/\r?\n/).length - 1;
        const charCount = content.length;
        
        return {
            ...baseDistribution(filePath),
            description: `Lines: ${lineCount}; Characters: ${charCount}`,
        };
    } catch { return baseDistribution(filePath); }
}

function inspectImage(filePath: string): Distribution {
    return {
        ...baseDistribution(filePath),
        description: "Image file",
    };
}

export function inspectFile(filePath: string): Distribution {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case ".csv": return inspectCsv(filePath);
        case ".json": return inspectJson(filePath);
        case ".xml":return inspectXml(filePath);
        case ".pdf": return inspectPdf(filePath);
        case ".xlsx": return inspectXlsx(filePath);
        case ".txt": return inspectTxt(filePath);
        case ".jpg":
        case ".jpeg":
        case ".png":
        case ".gif":
        case ".bmp":
        case ".svg":
        case ".webp": return inspectImage(filePath);
        default: return baseDistribution(filePath);
    }
}
