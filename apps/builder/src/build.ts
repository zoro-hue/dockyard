import { mkdir, readdir, stat, copyFile } from "fs/promises";
import { execSync } from "child_process";
import { createClient } from "redis";
import { join } from "path";
import { existsSync } from "fs";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const publisher = createClient({ url: redisUrl });
publisher.on('error', (err) => console.warn('[Build Publisher Warning]', err.message));

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

        // Find working directory with package.json (root or subfolder)
        let workingDir = projectPath;
        if (!existsSync(join(projectPath, "package.json"))) {
            try {
                const subdirs = await readdir(projectPath);
                for (const sub of subdirs) {
                    const subPath = join(projectPath, sub);
                    const subStats = await stat(subPath);
                    if (subStats.isDirectory() && existsSync(join(subPath, "package.json"))) {
                        workingDir = subPath;
                        console.log(`[Builder] Found package.json in subfolder: ${sub}`);
                        break;
                    }
                }
            } catch (e) {}
        }

        const packageJsonPath = join(workingDir, "package.json");

        if (existsSync(packageJsonPath)) {
            console.log(`[Builder] Found package.json at ${workingDir}. Installing & building...`);
            let buildResult = "";
            try {
                buildResult = execSync(`npm install --legacy-peer-deps && npm run build`, { 
                    cwd: workingDir,
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

            // Determine output folder (dist, build, out, or workingDir root)
            let outFolder = "";
            if (existsSync(join(workingDir, "dist"))) {
                outFolder = "dist";
            } else if (existsSync(join(workingDir, "build"))) {
                outFolder = "build";
            } else if (existsSync(join(workingDir, "out"))) {
                outFolder = "out";
            }

            if (outFolder) {
                console.log(`[Builder] Copying build output from ${outFolder} to ${buildPath}`);
                await copyDir(join(workingDir, outFolder), buildPath);
            } else {
                console.log(`[Builder] Copying all project files to ${buildPath}`);
                await copyDir(workingDir, buildPath);
            }
        } else {
            console.log(`[Builder] No package.json found. Serving static HTML site.`);
            await publisher.publish(`deployment:${projectId}:builder:build`, JSON.stringify({
                data: "No package.json found. Serving static HTML site."
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
