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
const tc = __importStar(require("@actions/tool-cache"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let unityVersion = core.getInput('unity-version');
            let unityVersionChangeset = core.getInput('unity-version-changeset');
            const unityModules = getInputArray('unity-modules');
            const unityModulesChild = core.getBooleanInput('unity-modules-child');
            const projectPath = core.getInput('project-path');
            const isSelfHosted = core.getBooleanInput('is-self-hosted');
            const unityActivateLicense = core.getBooleanInput('unity-activate-license');
            if (!unityVersion) {
                ;
                [unityVersion, unityVersionChangeset] = yield findProjectVersion(projectPath);
            }
            else if (!unityVersionChangeset) {
                unityVersionChangeset = yield findVersionChangeset(unityVersion);
            }
            yield installUnityHub(isSelfHosted);
            const unityPath = yield installUnityEditor(unityVersion, unityVersionChangeset);
            if (unityModules.length > 0) {
                yield installUnityModules(unityVersion, unityModules, unityModulesChild);
            }
            yield postInstall(isSelfHosted);
            core.setOutput('unity-version', unityVersion);
            core.setOutput('unity-path', unityPath);
            core.exportVariable('UNITY_PATH', unityPath);
            if (unityActivateLicense) {
                const unityUsername = core.getInput('unity-username');
                const unityPassword = core.getInput('unity-password');
                const unitySerial = core.getInput('unity-serial');
                if (unityUsername && unityPassword && unitySerial) {
                    const stdout = yield executeAtUnity(unityPath, `-batchmode -nographics -quit -logFile "-" -projectPath "?" -username "${unityUsername}" -password "${unityPassword}" -serial "${unitySerial}"`);
                    if (!stdout.includes('Licenses updated successfully')) {
                        throw new Error('Activation Failed');
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
        }
    });
}
function installUnityHub(isSelfHosted) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        switch (process.platform) {
            case 'linux':
                yield execute(`bash -c "echo \\"deb https://hub.unity3d.com/linux/repos/deb stable main\\" | tee /etc/apt/sources.list.d/unityhub.list"`, { sudo: !isSelfHosted });
                yield execute('bash -c "wget -qO - https://hub.unity3d.com/linux/keys/public | gpg --dearmor -o /etc/apt/trusted.gpg.d/unityhub.gpg"', { sudo: !isSelfHosted });
                yield execute('apt-get update', { sudo: !isSelfHosted });
                yield execute('apt-get install -y xvfb unityhub', { sudo: !isSelfHosted });
                break;
            case 'darwin':
                if (!fs.existsSync('/Applications/Unity Hub.app/Contents/MacOS/Unity Hub')) {
                    const installerPath = yield tc.downloadTool('https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.dmg');
                    yield execute(`hdiutil mount "${installerPath}"`, { sudo: !isSelfHosted });
                    const hubVolume = (_a = (yield execute('ls /Volumes')).match(/Unity Hub.*/)) === null || _a === void 0 ? void 0 : _a[0];
                    yield execute(`ditto "/Volumes/${hubVolume}/Unity Hub.app" "/Applications/Unity Hub.app"`);
                    yield execute(`hdiutil detach "/Volumes/${hubVolume}"`, {
                        sudo: !isSelfHosted
                    });
                    yield execute(`rm "${installerPath}"`);
                }
                break;
            case 'win32':
                if (!fs.existsSync('C:/Program Files/Unity Hub/Unity Hub.exe')) {
                    const installerPath = yield tc.downloadTool('https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.exe');
                    yield execute(`"${installerPath}" /s`);
                    yield execute(`del "${installerPath}"`);
                }
                break;
            default:
                throw new Error('Unknown Platform');
        }
    });
}
function installUnityEditor(unityVersion, unityVersionChangeset) {
    return __awaiter(this, void 0, void 0, function* () {
        let unityPath = yield findUnity(unityVersion);
        if (!unityPath) {
            yield executeAtUnityHub(`install --version ${unityVersion} --changeset ${unityVersionChangeset}`);
            unityPath = yield findUnity(unityVersion);
        }
        return unityPath;
    });
}
function installUnityModules(unityVersion, unityModules, unityModulesChild) {
    return __awaiter(this, void 0, void 0, function* () {
        const modulesArgs = unityModules
            .map(s => `--module ${s.toLowerCase()}`)
            .join(' ');
        const childModulesArg = unityModulesChild ? '--childModules' : '';
        const stdout = yield executeAtUnityHub(`install-modules --version ${unityVersion} ${modulesArgs} ${childModulesArg}`);
        if (!stdout.includes('successfully') &&
            !stdout.includes("it's already installed")) {
            throw new Error('Module Installation Failed');
        }
    });
}
function findUnity(unityVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        let unityPath = '';
        const output = yield executeAtUnityHub('editors --installed');
        const match = output.match(new RegExp(`${unityVersion}.+, installed at (.+)`));
        if (match) {
            unityPath = match[1];
            if (unityPath && process.platform === 'darwin') {
                unityPath += '/Contents/MacOS/Unity';
            }
        }
        return unityPath;
    });
}
function findProjectVersion(projectPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const filePath = path.join(projectPath, 'ProjectSettings/ProjectVersion.txt');
        if (fs.existsSync(filePath)) {
            const fileText = fs.readFileSync(filePath, 'utf8');
            const match1 = fileText.match(/m_EditorVersionWithRevision: (.+) \((.+)\)/);
            if (match1) {
                const version = match1[1];
                const changeset = match1[2];
                return [version, changeset];
            }
            const match2 = fileText.match(/m_EditorVersion: (.+)/);
            if (match2) {
                const version = match2[1];
                const changeset = yield findVersionChangeset(version);
                return [version, changeset];
            }
        }
        throw new Error(`Project not found at path: ${projectPath}`);
    });
}
function findVersionChangeset(unityVersion) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let changeset = '';
        try {
            let versionPageUrl = '';
            if (unityVersion.includes('a')) {
                versionPageUrl = `https://unity3d.com/unity/alpha/${unityVersion}`;
            }
            else if (unityVersion.includes('b')) {
                versionPageUrl = `https://unity3d.com/unity/beta/${unityVersion}`;
            }
            else if (unityVersion.includes('f')) {
                versionPageUrl = `https://unity3d.com/unity/whats-new/${(_a = unityVersion.match(/[.0-9]+/)) === null || _a === void 0 ? void 0 : _a[0]}`;
            }
            const pagePath = yield tc.downloadTool(versionPageUrl);
            const pageText = fs.readFileSync(pagePath, 'utf8');
            const match = pageText.match(new RegExp(`unityhub://${unityVersion}/([a-z0-9]+)`)) ||
                pageText.match(/Changeset:<\/span>[ \n]*([a-z0-9]{12})/);
            changeset = match === null || match === void 0 ? void 0 : match[1];
        }
        catch (error) {
            if (error instanceof Error)
                core.error(error);
        }
        if (!changeset) {
            throw new Error("Can't find Unity version changeset automatically");
        }
        return changeset;
    });
}
function postInstall(isSelfHosted) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.platform === 'darwin') {
            yield execute('mkdir -p "/Library/Application Support/Unity"', {
                sudo: !isSelfHosted
            });
            yield execute(`chown -R ${process.env.USER} "/Library/Application Support/Unity"`, { sudo: !isSelfHosted });
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
function executeAtUnityHub(args) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (process.platform) {
            case 'linux':
                return yield execute(`xvfb-run --auto-servernum unityhub --headless ${args} --disable-gpu-sandbox`, { ignoreReturnCode: true });
            case 'darwin':
                return yield execute(`"/Applications/Unity Hub.app/Contents/MacOS/Unity Hub" -- --headless ${args}`, {
                    ignoreReturnCode: true
                });
            case 'win32':
                return yield execute(`"C:/Program Files/Unity Hub/Unity Hub.exe" -- --headless ${args}`, {
                    ignoreReturnCode: true
                });
            default:
                throw new Error('Unknown Platform');
        }
    });
}
function getInputArray(name) {
    return core
        .getInput(name)
        .split('\n')
        .map(s => s.trim())
        .filter(x => x !== '');
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
