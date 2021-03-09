import * as JsonConfig from "../octofarm-cli.config.json";
import {Config} from "../schemas/config";

export function getMergedValidatedConfig(yargs?: any[]) {
    return JsonConfig as Config;
}