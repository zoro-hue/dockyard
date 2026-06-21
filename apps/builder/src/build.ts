import { mkdir, readdir, stat, copyFile } from "fs/promises";
import { execSync } from "child_process";
import { createClient } from "redis";
import { join } from "path";
import { existsSync } from "fs";

const publisher = createClient();

// Recursive copy function
const copyDir = async (src: string, dest: string) => {
    await mkdir(dest, { recursive: true });
    const items = await readdir(src);
    for (const item of items) {
        if (item === "node_modules" || item === ".git") continue;
        const srcItem = join(src, item);
        const destItem = join(dest, item);
        const stats = await stat(srcItem);
        if (stats.isDirectory()) {
            await copyDir(srcItem, destItem);
        } else {
            await copyFile(srcItem, destItem);
        }
    }
};

export const buildProject = async (projectId: string) => {
    try {
        if (!publisher.isOpen) {
            await publisher.connect();
        }

        const projectPath = join(process.cwd(), "downloads", projectId);
        const buildPath = join(process.cwd(), "builds", projectId);

        await mkdir(buildPath, { recursive: true });

        const packageJsonPath = join(projectPath, "package.json");

        if (existsSync(packageJsonPath)) {
            // It has package.json - try to install and build
            console.log(`[Builder] Found package.json for project ${projectId}. Building...`);
            let buildResult = "";
            try {
                buildResult = execSync(`npm install && npm run build`, { 
                    cwd: projectPath,
                    encoding: 'utf-8',
                    stdio: 'pipe' 
                });
            } catch (err: any) {
                buildResult = err.stdout || err.stderr || err.message;
                console.error(`[Builder] Build script error:`, buildResult);
            }

            await publisher.publish(`deployment:${projectId}:builder:build`, JSON.stringify({
                data: buildResult
            }));

            // Determine output folder (dist, build, out, or project root)
            let outFolder = "";
            if (existsSync(join(projectPath, "dist"))) {
                outFolder = "dist";
            } else if (existsSync(join(projectPath, "build"))) {
                outFolder = "build";
            } else if (existsSync(join(projectPath, "out"))) {
                outFolder = "out";
            }

            if (outFolder) {
                console.log(`[Builder] Copying build output from ${outFolder} to ${buildPath}`);
                await copyDir(join(projectPath, outFolder), buildPath);
            } else {
                console.log(`[Builder] No standard build output folder found. Copying all files...`);
                await copyDir(projectPath, buildPath);
            }
        } else {
            // Static HTML site! Just copy the project files directly to buildPath.
            console.log(`[Builder] No package.json found for project ${projectId}. Treating as a static site.`);
            await publisher.publish(`deployment:${projectId}:builder:build`, JSON.stringify({
                data: "No package.json found. Serving as static HTML site."
            }));
            await copyDir(projectPath, buildPath);
        }

        console.log(`[Builder] Project ${projectId} build processed successfully.`);
    } catch (error: any) {
        console.error(`Error building project ${projectId}:`, error);
        if (publisher.isOpen) {
            await publisher.publish(`deployment:${projectId}:builder:build`, JSON.stringify({
                data: `Build failed: ${error.message}`
            }));
        }
    }
};
