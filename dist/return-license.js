"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
function run() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const unityActivateLicense = core.getBooleanInput('unity-activate-license');
            if (unityActivateLicense) {
                const unityPath = ((_a = process.env) === null || _a === void 0 ? void 0 : _a.UNITY_PATH) || '';
                const unityUsername = core.getInput('unity-username');
                const unityPassword = core.getInput('unity-password');
                if (unityUsername && unityPassword) {
                    yield executeAtUnity(unityPath, `-batchmode -nographics -quit -logFile "-" -projectPath "?" -returnlicense -username "${unityUsername}" -password "${unityPassword}"`);
                }
            }
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
        }
    });
}
function executeAtUnity(unityPath, args) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.platform === 'linux') {
            return yield execute(`xvfb-run --auto-servernum "${unityPath}" ${args}`, {
                ignoreReturnCode: true
            });
        }
        else {
            return yield execute(`"${unityPath}" ${args}`, { ignoreReturnCode: true });
        }
    });
}
function execute(command, options) {
    return __awaiter(this, void 0, void 0, function* () {
        let output = '';
        const prefix = (options === null || options === void 0 ? void 0 : options.sudo) === true ? 'sudo ' : '';
        const execOptions = {
            ignoreReturnCode: (options === null || options === void 0 ? void 0 : options.ignoreReturnCode) || false,
            listeners: {
                stdout: (buffer) => (output += buffer.toString())
            }
        };
        yield exec.exec(prefix + command, [], execOptions);
        return output;
    });
}
run();
