import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { cwd } from "process";

function getCandidateBuildPaths(id: string): string[] {
    const candidates = [
        join(cwd(), "builds", id),
        join(cwd(), "outputs", id),
    ];
    if (process.env.LOCAL_S3_DIR) {
        candidates.push(join(process.env.LOCAL_S3_DIR, "builds", id));
        candidates.push(join(process.env.LOCAL_S3_DIR, "outputs", id));
    }
    return candidates;
}

function searchHtmlRecursive(dir: string, depth = 0): string | null {
    if (depth > 3 || !existsSync(dir)) return null;
    try {
        const items = readdirSync(dir, { withFileTypes: true });

        // 1. Direct index.html or index.htm
        for (const item of items) {
            if (item.isFile() && (item.name.toLowerCase() === "index.html" || item.name.toLowerCase() === "index.htm")) {
                return join(dir, item.name);
            }
        }

        // 2. Check prioritized subdirectories: dist, build, out, public, web, client, src
        const priorityDirs = ["dist", "build", "out", "public", "web", "client", "src"];
        for (const pDir of priorityDirs) {
            const sub = join(dir, pDir);
            if (existsSync(sub)) {
                const found = searchHtmlRecursive(sub, depth + 1);
                if (found) return found;
            }
        }

        // 3. Check any other subdirectories
        for (const item of items) {
            if (item.isDirectory() && !priorityDirs.includes(item.name) && item.name !== "node_modules" && item.name !== ".git") {
                const found = searchHtmlRecursive(join(dir, item.name), depth + 1);
                if (found) return found;
            }
        }

        // 4. Fallback to any .html file in current directory
        for (const item of items) {
            if (item.isFile() && item.name.toLowerCase().endsWith(".html")) {
                return join(dir, item.name);
            }
        }
    } catch {}
    return null;
}

function findIndexPath(id: string): string | null {
    for (const baseDir of getCandidateBuildPaths(id)) {
        if (!existsSync(baseDir)) continue;
        const found = searchHtmlRecursive(baseDir);
        if (found) return found;
    }
    return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const indexPath = findIndexPath(id);

    if (!indexPath) {
        const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dockyard - No Frontend Detected</title>
    <style>
        body { margin: 0; background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { max-width: 520px; width: 100%; border: 1px solid #27272a; padding: 36px; background: #09090b; }
        .badge { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #ef4444; border: 1px solid #ef4444; padding: 4px 10px; margin-bottom: 20px; }
        h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px 0; letter-spacing: -0.02em; }
        p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px 0; }
        code { background: #18181b; color: #fafafa; padding: 2px 6px; font-size: 13px; font-family: monospace; }
        .footer { font-size: 12px; color: #71717a; border-top: 1px solid #27272a; padding-top: 16px; margin-top: 24px; font-family: monospace; }
        a { color: #fff; font-weight: 600; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">No Frontend Detected</div>
        <h1>No index.html found for project: <code>${id}</code></h1>
        <p>Dockyard looked through your project files, but could not find an <code>index.html</code> or web entry point.</p>
        <p><strong>Note:</strong> Dockyard is a <strong>frontend web deployment platform</strong> (for React, Vite, Next.js, Vue, or static HTML/CSS/JS sites). Non-web repositories (like Python scripts, backend APIs, or command-line tools) cannot be served in a browser.</p>
        <div class="footer">DOCKYARD FRONTEND DEPLOYMENT PLATFORM</div>
    </div>
</body>
</html>`;
        return new NextResponse(errorHtml, {
            status: 404,
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    }

    try {
        const fileContent = await readFile(indexPath);
        return new NextResponse(fileContent, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    } catch {
        return new NextResponse("Error loading project index.html", { status: 500 });
    }
}
