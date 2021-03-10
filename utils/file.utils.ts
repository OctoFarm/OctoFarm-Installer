import fs from "fs";
import path from "path";

export function createFolderIfNotExists(outputFolder: string) {
    if (!fs.existsSync(outputFolder)) {
        console.log("Creating folder", path.resolve(outputFolder));
        fs.mkdirSync(outputFolder, {recursive: true});
    }
}

export function stringGrepFirstLine(stringBuffer: string, grepString: string) {
    let dataArray = stringBuffer.split('\n'); // convert file data in an array

    let lastIndex = -1; // let say, we have not found the keyword
    for (let index = 0; index < stringBuffer.length; index++) {
        if (dataArray[index].includes(grepString)) { // check if a line contains the keyword
            lastIndex = index; // found a line includes a 'user1' keyword
            break;
        }
    }

    if (lastIndex === -1) {
        return null;
    }
    return dataArray[lastIndex];
}

function removeBunyanDep(file) {
    const buffer = fs.readFileSync(file, {encoding: 'utf-8'});
    let dataArray = buffer.split('\n'); // convert file data in an array
    const searchKeyword = 'bunyan'; // we are looking for a line, contains, key word 'user1' in the file
    let lastIndex = -1; // let say, we have not found the keyword
    for (let index = 0; index < dataArray.length; index++) {
        if (dataArray[index].includes(searchKeyword)) { // check if a line contains the keyword
            lastIndex = index; // found a line includes a 'user1' keyword
            break;
        }
    }
    dataArray.splice(lastIndex, 1); // remove the keyword 'user1' from the data Array

    const updatedData = dataArray.join('\n');
    fs.writeFileSync(file, updatedData);
}

export function patchPackageJsonBunyan(tag: string, packageJsonFile: string) {
    if (!fs.existsSync(packageJsonFile)) {
        throw Error("Provided package.json path does not exist: " + packageJsonFile);
    }
    removeBunyanDep(packageJsonFile);
    if (tag.includes("1.1.")) {
        tag.replace("1.1.", "");
        const patchVersion = parseInt(tag, 10);
        if (patchVersion < 13) {
            console.warn("Patching package.json bug in versions before 1.1.13... removing bunyan dependency");
        }
    }
}