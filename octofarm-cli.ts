import * as stream from 'stream';
import {promisify} from 'util';
import axios from "axios";
import * as fs from "fs";
import {createWriteStream} from "fs";
import path from "path";
import {ReleasesDtoSet} from "./schemas/releases";
import {createFolderIfNotExists, patchPackageJsonBunyan} from "./utils/file.utils";
import {getMergedValidatedConfig} from "./utils/parse-config.util";
import {execSync} from "child_process";

const decompress = require('decompress');
const ProgressBar = require('progress');
var github = require('octonode');
const finished = promisify(stream.finished);

export async function downloadFile(fileUrl: string, basePath, releaseTag: string): Promise<any> {
    const writer = createWriteStream(path.join(basePath, `octofarm-${releaseTag}-download.zip`));
    console.warn('Downloading release from URL', fileUrl);
    return axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream'
    }).then(async response => {
        const contentLength = response.headers['content-length'];
        let progressBar = null;
        if (!contentLength) {
            console.error("content-length was undefined, cant show progress bar.");
        } else {
            progressBar = new ProgressBar(`-> Downloading OctoFarm ${releaseTag} [:bar] :percent :etas`, {
                width: 40,
                complete: '=',
                incomplete: ' ',
                renderThrottle: 1,
                total: parseInt(contentLength)
            });
        }
        response.data.on('data', (chunk) => {
            progressBar?.tick(chunk.length);
        });
        response.data.pipe(writer);
        await finished(writer);
        return writer.path;
    });
}

function getReleaseFolder(basePath: string, releaseTag: string) {
    return path.join(basePath, `octofarm-${releaseTag}`);
}

function checkTargetFolderExists(targetFolder: string): boolean {
    return fs.existsSync(targetFolder);
}

async function decompressAndRenameRelease(compressedFile: string, basePath: string, targetFolderName) {
    console.warn('Safe to continue, decompressing and renaming release...');
    const fileList = await decompress(compressedFile, basePath);
    const octoFarmDir = fileList[0];
    if (octoFarmDir.type !== 'directory') {
        throw Error("Expected decompress result to have a folder at index 0. Can't rename OctoFarm folder.");
    }
    fs.renameSync(path.join(basePath, octoFarmDir.path), targetFolderName);
    return fileList;
}

var githubOrg = 'octofarm';
var productRepo = 'octofarm';
const releasesDir = "releases";

const config = getMergedValidatedConfig();
createFolderIfNotExists(releasesDir);

var clientReleases = github.client().repo(`${githubOrg}/${productRepo}`);
clientReleases.releases(async function (err, s: ReleasesDtoSet, b, h) {
    const latestRelease = s[0];
    const latestReleaseTarUrl = latestRelease.zipball_url;
    const latestReleaseTag = latestRelease.tag_name;

    const archivePath = await downloadFile(latestReleaseTarUrl, releasesDir, latestReleaseTag);
    const targetFolder = getReleaseFolder(releasesDir, latestReleaseTag);
    if (checkTargetFolderExists(targetFolder)) {
        if (config.decompress_overwrite === true) {
            fs.rmdirSync(targetFolder, {recursive: true});
        } else {
            throw Error(`Targeted release folder '${targetFolder}' already exists, please set 'decompress_overwrite' (${config.decompress_overwrite}) to true or remove the folder`);
        }
    }

    await decompressAndRenameRelease(archivePath, releasesDir, targetFolder)
        .catch(error => {
            console.error(error);
        });

    if (config.cleanup_downloaded_archive === true) {
        console.log(`Cleaning up archive ${archivePath}.`);
        fs.rmSync(archivePath);
    }

    if (config.clean_old_versions === true) {

    }

    patchPackageJsonBunyan(latestReleaseTag, path.join(targetFolder, 'package.json'));
    execSync("npm ci --production", {cwd: targetFolder, stdio: "inherit"});
    console.warn('OctoFarm-cli is done. \n\tHappy printing and may the toilet roll watch over you.');
});