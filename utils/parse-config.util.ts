import * as JsonConfig from "../octofarm-installer.config.json";
import {Config} from "../schemas/config.model";
import {validateOrReject} from "class-validator";

export async function getMergedValidatedConfig(yargs?: any[]) {
    // TODO merge provided yargs with config as override flags!

    const newConfig = new Config(JsonConfig);
    await validateOrReject(newConfig, {forbidUnknownValues: true, stopAtFirstError: false});

    return newConfig;
}