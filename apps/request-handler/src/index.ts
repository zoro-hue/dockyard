import express, { Request, Response } from "express";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

function getLocalS3Dir(): string {
    if (process.env.LOCAL_S3_DIR) return process.env.LOCAL_S3_DIR;
    let curr = process.cwd();
    while (curr && curr !== resolve(curr, "..")) {
        if (existsSync(join(curr, "turbo.json"))) {
            return join(curr, "local-s3-bucket");
        }
        curr = resolve(curr, "..");
    }
    return join(process.cwd(), "local-s3-bucket");
}

const app = express();
const LOCAL_S3_DIR = getLocalS3Dir();
const port = parseInt(process.env.PORT || "4000", 10);

app.get("/*", async (req: Request, res: Response) => {
    try {
        const hostname = req.hostname;
        let projectId = hostname.split(".")[0];
        let requestPath = req.path === "/" ? "/index.html" : req.path;

        // Support subpath routing: /deployments/{projectId}/*
        if (req.path.startsWith("/deployments/")) {
            const parts = req.path.split("/");
            projectId = parts[2];
            const subPath = parts.slice(3).join("/");
            requestPath = "/" + (subPath || "index.html");
        }

        const filePath = join(LOCAL_S3_DIR, "builds", projectId, requestPath);

        const data = await readFile(filePath);

        let contentType;

        switch (true) {
            case requestPath.endsWith(".css"):
                contentType = "text/css";
                break;
            case requestPath.endsWith(".js"):
                contentType = "application/javascript";
                break;
            case requestPath.endsWith(".png"):
                contentType = "image/png";
                break;
            case requestPath.endsWith(".svg"):
                contentType = "image/svg+xml";
                break;
            default:
                contentType = "text/html";
        }

        res.setHeader("Content-Type", contentType);

        // Handle binary data properly for images
        if (contentType.startsWith("image/")) {
            res.send(data);
        } else {
            res.send(data.toString("utf-8"));
        }
    } catch (error) {
        res.status(404).send("Not found");
    }
});

app.listen(port, () => {
    console.log(`Request-handler running on port ${port}`);
});