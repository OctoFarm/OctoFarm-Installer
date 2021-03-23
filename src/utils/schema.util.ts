import {createFolderIfNotExists} from "./file.utils";
import path from "path";
import {transform} from "json-to-typescript/index";
import fs from "fs";
import {getGithubReleases} from "./github-release.client";

export function generateSchema(jsonBody: any, tsName: string, interfaceName: string, outputFolder: string) {
    const schemaDtoFile = path.join(outputFolder, tsName);
    transform(interfaceName, jsonBody)
        .then(transformation => {
            fs.writeFileSync(schemaDtoFile, transformation);
        });
}

export function updateReleasesSchema(repoUrl, schemaFolder) {
    createFolderIfNotExists(schemaFolder);
    const clientReleases = getGithubReleases('octofarm/octofarm', true)
        .then(r => {
            generateSchema(r, 'releases.d.ts', 'ReleasesDto', schemaFolder);
        });
}

var githubOrg = 'octofarm';
var productRepo = 'octofarm';
const outputdir = __dirname + '/../schemas';
updateReleasesSchema(`${githubOrg}/${productRepo}`, outputdir);