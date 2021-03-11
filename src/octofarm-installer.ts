import * as stream from 'stream';
import {promisify} from 'util';
import axios from "axios";
import * as fs from "fs";
import {createWriteStream, readdirSync} from "fs";
import path from "path";
import {ReleasesDto, ReleasesDtoSet} from "./schemas/releases";
import {
    createFolderIfNotExists,
    patchPackageJsonBunyan,
    printOurToiletSaviour,
    stringGrepFirstLine
} from "./utils/file.utils";
import {getMergedValidatedConfig} from "./utils/parse-config.util";
import {execSync} from "child_process";
import {Config} from "./schemas/config.model";
import githubApiClient from 'octonode';
import decompress from 'decompress';
import ProgressBar from "progress";

const finished = promisify(stream.finished);

export async function downloadFile(fileUrl: string, basePath, releaseTag: string): Promise<any> {
    const writer = createWriteStream(path.join(basePath, `octofarm-${releaseTag}-download.zip`));
    console.warn('Downloading release from URL', fileUrl);
    return axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream'
    }).then(async response => {
        let contentLength = response.headers['content-length'];
        let progressBar = null;
        if (!contentLength) {
            console.error("content-length was undefined, guessing download size.");
            contentLength = 17320068;
        }

        progressBar = new ProgressBar(`-> Downloading OctoFarm ${releaseTag} [:bar] :percent :etas`, {
            width: 40,
            complete: '=',
            incomplete: ' ',
            renderThrottle: 1,
            total: parseInt(contentLength)
        });

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

function getPm2VersionIfInstalled(): string {
    try {
        console.log("Checking pm2 installation");
        const commandOutput = execSync("npm list --depth=0 -g pm2", {encoding: "utf8"});
        console.log("Npm list command output:'" + JSON.stringify(commandOutput) + "'");
        if (!!stringGrepFirstLine(commandOutput, "pm2")) {
            return commandOutput;
        } else {
            return null;
        }
    } catch (e) {
        console.log("Checking pm2 failed: not installed.");
        return null;
    }
}

function ensurePm2Installed() {
    const pm2CheckResultBuffer = getPm2VersionIfInstalled();
    if (!pm2CheckResultBuffer) {
        console.warn("pm2 was not installed. Running 'npm install -g pm2' for you.");
        let result;
        try {
            result = execSync("npm install -g pm2", {encoding: "utf8"});
        } catch (e) {
            throw Error("Failed on installing pm2 as a global module, please verify Node is installed or run this installer with sudo if you'd like this to succeed. Command 'npm install -g pm2' failed: " + JSON.stringify(e));
        }
        console.warn("Installed pm2 successfully.", result.trim());
    } else {
        console.log("pm2 verified to be already installed: ", pm2CheckResultBuffer.trim());
    }
}

async function getLatestReleaseInfo(config: Config): Promise<ReleasesDto> {
    const repoUrl = config.getGithubRepoUrl();
    const clientReleases = githubApiClient.client().repo(repoUrl);
    let latestRelease = null;

    return await new Promise((resolve, reject) => {
        clientReleases.releases(function (err, s: ReleasesDtoSet, b, h) {
            if (!s || s.length === 0) {
                throw new Error(`Received an empty list of releases for OctoFarm. Are you sure the right repository was configured? This is currently provided repo URL: ${repoUrl}`)
            }
            if (!!err) {
                reject(err);
            }
            latestRelease = s[0] as ReleasesDto;
            resolve(latestRelease);
        });
    });
}

function getCurrentInstalledRelease(config: Config, release_tag_name): boolean {
    const releaseFolder = getReleaseFolder(config.release_folder, release_tag_name);
    if (!fs.existsSync(releaseFolder)) {
        return null;
    }

    const packageJsonFilePath = path.join('./', releaseFolder, 'package.json');
    if (!fs.existsSync(packageJsonFilePath)) {
        throw Error("Folder with latest release name was found, but no package.json was present in it. Are you sure everything is OK here? Please check.");
    } else {
        const jsonFile = JSON.parse(fs.readFileSync(packageJsonFilePath, {encoding: "utf8"}));
        return jsonFile.version === release_tag_name;
    }
}

async function downloadAndInstallRelease(config: Config, releaseToDownload: ReleasesDto) {
    const latestReleaseTarUrl = releaseToDownload.tarball_url;
    const latestReleaseTag = releaseToDownload.tag_name;
    const releasesDir = config.release_folder;

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
            console.error("Aborting due to error:", error);
            process.exit(-1);
        });

    if (config.cleanup_downloaded_archive === true) {
        console.log(`Cleaning up downloaded release archive ${archivePath}.`);
        fs.rmSync(archivePath);
        console.log(`✓ Cleaning up done.`);
    }

    patchPackageJsonBunyan(latestReleaseTag, path.join(targetFolder, 'package.json'));
    execSync("npm ci --production", {cwd: targetFolder, stdio: "inherit"});

    if (config.clean_old_versions === true) {
        const otherReleaseDirs = readdirSync(releasesDir, {withFileTypes: true})
            .filter(dirent => dirent.isDirectory() && !dirent.name.includes(latestReleaseTag))
            .map(dirent => path.join(releasesDir, dirent.name));
        console.warn(`Found ${otherReleaseDirs.length} releases which will be removed.`);
        otherReleaseDirs.forEach(dir => {
            console.warn(`\t- Deleting other OctoFarm release in ${dir}.`);
            fs.rmdirSync(dir, {recursive: true});
        });
    }
}

(async () => {
    printOurToiletSaviour();

    const config = await getMergedValidatedConfig();
    createFolderIfNotExists(config.release_folder);

    if (config.skip_pm2_checks === false) {
        // const result = execSync("npm uninstall -g pm2");
        ensurePm2Installed();
    } else {
        console.log("-- skipped pm2 installation.")
    }
    const latestRelease = await getLatestReleaseInfo(config);
    console.log(`✓ Received latest release from github: ${latestRelease.tag_name}`);
    const installedLatestRelease = getCurrentInstalledRelease(config, latestRelease.tag_name);
    console.log(`✓ Checked for update: ${installedLatestRelease ? "update available" : "already up to date"}.`);
    if (!installedLatestRelease) {
        console.log("We'll install this updated version for OctoFarm next: ", latestRelease.tag_name);
        await downloadAndInstallRelease(config, latestRelease);
    }
    console.log(`✓ The latest OctoFarm (${latestRelease.tag_name}) is installed, so you're good to go!`);

    console.log(`✓ OctoFarm-Installer has verified the installation of version ${latestRelease.tag_name};
    Please consider becoming a Patreon https://www.patreon.com/NotExpectedYet and may the toilet roll watch over you ❤ .
    Discord? https://discord.gg/vjabMUn
    Github? https://github.com/OctoFarm/OctoFarm
    Site? https://octofarm.net/`);
})().catch(err => {
    console.error("An error occurred whilst running OctoFarm-Installer:\n", err);
});
