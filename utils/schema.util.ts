import {createFolderIfNotExists} from "./file.utils";
import path from "path";
import {transform} from "json-to-typescript/index";
import fs from "fs";
var github = require('octonode');

export function generateSchema(jsonBody: any, tsName: string, interfaceName: string, outputFolder: string) {
    const schemaDtoFile = path.join(outputFolder, tsName);
    transform(interfaceName, jsonBody)
        .then(transformation => {
            fs.writeFileSync(schemaDtoFile, transformation);
        });
}

export function updateReleasesSchema(repoUrl, schemaFolder) {
    createFolderIfNotExists(schemaFolder);
    const clientReleases = github.client().repo(repoUrl);
    clientReleases.releases(function (err, s, b, h) {
        generateSchema(s, 'releases.d.ts', 'ReleasesDto', schemaFolder);
    });
}

var githubOrg = 'octofarm';
var productRepo = 'octofarm';
const outputdir = './schemas';
updateReleasesSchema(`${githubOrg}/${productRepo}`, outputdir);