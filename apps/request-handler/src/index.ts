import express, { Request, Response } from "express";
import { readFile } from "fs/promises";
import { join } from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const LOCAL_S3_DIR = "d:\\XboxGames\\vercel-main\\local-s3-bucket";

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

app.listen(4000, () => {
    console.log("Server is running on port 4000");
});