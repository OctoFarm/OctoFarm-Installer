import {IsDefined} from "class-validator";

export class Config {
    cleanup_downloaded_archive: boolean;
    decompress_overwrite: boolean;
    clean_old_versions: boolean;
    skip_pm2_checks: boolean;
    prereleases_allowed: boolean;
    github_org: string = "octofarm";
    github_repo: string = "octofarm";

    @IsDefined({message: "The 'release_folder' needs to be defined in order to install OctoFarm"})
    release_folder: string = "releases";

    constructor(configPartial?: Partial<Config>) {
        configPartial && Object.assign(this, configPartial);
    }

    public getGithubRepoUrl() {
        if (!this.github_repo || !this.github_org)
            return null;
        return `${this.github_org}/${this.github_repo}`;
    }
}