import * as fs from "node:fs";

async function test() {
    console.log("Attempting to import pdf-parse...");
    try {
        const imported = await import("pdf-parse");
        console.log("Imported keys:", Object.keys(imported));
        console.log("Imported default type:", typeof imported.default);
        
        const pdfParse = imported.default;
        
        // Create a dummy PDF file if it doesn't exist just to test the call
        // Actually, we can just try to pass a dummy Buffer and see if it throws or works.
        // A minimal valid PDF is hard to craft manually but pdf-parse might handle a Buffer.
        const dummyBuffer = Buffer.from("%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj 4 0 obj<</Length 1>>\n \nendobj\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n123\n%%EOF");
        
        console.log("Calling pdfParse(dummyBuffer)...");
        const result = await pdfParse(dummyBuffer);
        console.log("Parse result keys:", Object.keys(result));
        console.log("Parse text length:", result.text?.length);
    } catch (e) {
        console.error("Caught error:", e);
    }
}

test();
