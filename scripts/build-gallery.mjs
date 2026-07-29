import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const photosDirectory = path.join(projectRoot, "assets", "photos");
const videosDirectory = path.join(projectRoot, "assets", "videos");
const thumbnailsDirectory = path.join(projectRoot, "assets", "video-thumbnails");
const manifestPath = path.join(projectRoot, "assets", "media-manifest.js");

const photoPattern = /\.(avif|gif|jpe?g|png|webp)$/i;
const videoPattern = /\.(m4v|mov|mp4|webm)$/i;

async function fileExists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

function commandExists(command) {
    const result = spawnSync("which", [command], { stdio: "ignore" });
    return result.status === 0;
}

function runMediaCommand(command, args, expectedOutput) {
    const result = spawnSync(command, args, { stdio: "inherit" });

    if (result.status !== 0) {
        throw new Error(`Media generation failed for ${path.basename(expectedOutput)}.`);
    }
}

async function generateThumbnail(videoFile, thumbnailFile) {
    if (await fileExists(thumbnailFile)) {
        return;
    }

    const videoPath = path.join(videosDirectory, videoFile);

    if (commandExists("ffmpeg")) {
        runMediaCommand(
            "ffmpeg",
            [
                "-y",
                "-ss",
                "00:00:01",
                "-i",
                videoPath,
                "-frames:v",
                "1",
                "-vf",
                "scale=1280:-2",
                thumbnailFile
            ],
            thumbnailFile
        );
        return;
    }

    if (process.platform === "darwin" && commandExists("qlmanage")) {
        runMediaCommand(
            "qlmanage",
            ["-t", "-s", "1280", "-o", thumbnailsDirectory, videoPath],
            thumbnailFile
        );
        return;
    }

    throw new Error(
        `No thumbnail generator is available for ${videoFile}. Install ffmpeg and run the build again.`
    );
}

function browserPath(...parts) {
    return parts.join("/");
}

function numberedTitle(prefix, index) {
    return `${prefix} ${String(index + 1).padStart(2, "0")}`;
}

await mkdir(thumbnailsDirectory, { recursive: true });

const photoFiles = (await readdir(photosDirectory))
    .filter((file) => photoPattern.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const videoFiles = (await readdir(videosDirectory))
    .filter((file) => videoPattern.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const photos = photoFiles.map((file, index) => ({
    src: browserPath("assets", "photos", file),
    title: numberedTitle("Striping Project", index)
}));

const videos = [];

for (const [index, file] of videoFiles.entries()) {
    const thumbnailName = `${file}.png`;
    const thumbnailPath = path.join(thumbnailsDirectory, thumbnailName);

    await generateThumbnail(file, thumbnailPath);

    if (!(await fileExists(thumbnailPath))) {
        throw new Error(`Expected thumbnail was not created: ${thumbnailName}`);
    }

    videos.push({
        src: browserPath("assets", "videos", file),
        thumbnail: browserPath("assets", "video-thumbnails", thumbnailName),
        title: numberedTitle("Striping in Action", index)
    });
}

const manifest = {
    photos,
    videos
};

const manifestSource = `window.OHSTRIPE_MEDIA = ${JSON.stringify(manifest, null, 2)};\n`;
await writeFile(manifestPath, manifestSource, "utf8");

console.log(
    `Gallery synced: ${photos.length} photos, ${videos.length} videos, ${videos.length} video thumbnails.`
);
