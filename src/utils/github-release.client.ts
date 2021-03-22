import {ReleasesDto} from "../schemas/releases";
import axios from "axios";
import {Config} from "../schemas/config.model";

export async function getGithubReleases(orgRepoUrlPart, includePrereleases: boolean = false): Promise<ReleasesDto[]> {
    // https://api.github.com/repos/octofarm/octofarm/releases
    const releases = await axios.get<ReleasesDto[]>(
        `https://api.github.com/repos/${orgRepoUrlPart}/releases`, {
            headers: {
                "Content-Type": "application/json",
            },
        })
        .then((res) => res.data);
    if (!!releases && releases.length > 0) {
        return releases.filter((r) =>
            r.draft === false &&
            (r.prerelease === false || includePrereleases)
        );
    } else {
        return [];
    }
}

export async function getLatestReleaseInfo(config: Config): Promise<ReleasesDto> {
    const repoUrl = config.getGithubRepoUrl();
    return await getGithubReleases(repoUrl, config.prereleases_allowed)
        .then(r => {
            return r[0] as ReleasesDto;
        });
}

export function getReleaseDownloadUrl(release: ReleasesDto) {
    if (release.assets.length > 0) {
        return release.assets[0].browser_download_url;
    } else {
        console.warn('The release had no assets, so we\'re downloading the source code instead. Expect inconsistencies with OctoFarm\'s website as it\'s assets will most likely not be fully up-to-date!');
        return release.tarball_url;
    }
}

export function isAssetUrl(downloadUrl: string) {
    return downloadUrl.includes('https://github.com') && downloadUrl.includes('releases/download');
}