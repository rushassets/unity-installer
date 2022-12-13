import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import * as path from 'path'
import * as fs from 'fs'

async function run(): Promise<void> {
  try {
    let unityVersion = core.getInput('unity-version')
    let unityVersionChangeset = core.getInput('unity-version-changeset')
    const unityModules = getInputArray('unity-modules')
    const unityModulesChild = core.getBooleanInput('unity-modules-child')
    const projectPath = core.getInput('project-path')
    const isSelfHosted = core.getBooleanInput('is-self-hosted')
    const unityActivateLicense = core.getBooleanInput('unity-activate-license')

    if (!unityVersion) {
      ;[unityVersion, unityVersionChangeset] = await findProjectVersion(
        projectPath
      )
    } else if (!unityVersionChangeset) {
      unityVersionChangeset = await findVersionChangeset(unityVersion)
    }

    await installUnityHub(isSelfHosted)

    const unityPath = await installUnityEditor(
      unityVersion,
      unityVersionChangeset
    )

    if (unityModules.length > 0) {
      await installUnityModules(unityVersion, unityModules, unityModulesChild)
    }

    await postInstall(isSelfHosted)

    core.setOutput('unity-version', unityVersion)
    core.setOutput('unity-path', unityPath)

    core.exportVariable('UNITY_PATH', unityPath)

    if (unityActivateLicense) {
      const unityUsername = core.getInput('unity-username')
      const unityPassword = core.getInput('unity-password')
      const unitySerial = core.getInput('unity-serial')

      if (unityUsername && unityPassword && unitySerial) {
        const stdout = await executeAtUnity(
          unityPath,
          `-batchmode -nographics -quit -logFile "-" -projectPath "?" -username "${unityUsername}" -password "${unityPassword}" -serial "${unitySerial}"`
        )

        if (!stdout.includes('Licenses updated successfully')) {
          throw new Error('Activation Failed')
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function installUnityHub(isSelfHosted: boolean): Promise<void> {
  switch (process.platform) {
    case 'linux':
      await execute(
        `bash -c "echo \\"deb https://hub.unity3d.com/linux/repos/deb stable main\\" | tee /etc/apt/sources.list.d/unityhub.list"`,
        {sudo: !isSelfHosted}
      )
      await execute(
        'bash -c "wget -qO - https://hub.unity3d.com/linux/keys/public | gpg --dearmor -o /etc/apt/trusted.gpg.d/unityhub.gpg"',
        {sudo: !isSelfHosted}
      )
      await execute('apt-get update', {sudo: !isSelfHosted})
      await execute('apt-get install -y xvfb unityhub', {sudo: !isSelfHosted})
      break
    case 'darwin':
      if (
        !fs.existsSync('/Applications/Unity Hub.app/Contents/MacOS/Unity Hub')
      ) {
        const installerPath = await tc.downloadTool(
          'https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.dmg'
        )
        await execute(`hdiutil mount "${installerPath}"`, {sudo: !isSelfHosted})
        const hubVolume = (await execute('ls /Volumes')).match(
          /Unity Hub.*/
        )?.[0]
        await execute(
          `ditto "/Volumes/${hubVolume}/Unity Hub.app" "/Applications/Unity Hub.app"`
        )
        await execute(`hdiutil detach "/Volumes/${hubVolume}"`, {
          sudo: !isSelfHosted
        })
        await execute(`rm "${installerPath}"`)
      }
      break
    case 'win32':
      if (!fs.existsSync('C:/Program Files/Unity Hub/Unity Hub.exe')) {
        const installerPath = await tc.downloadTool(
          'https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.exe'
        )
        await execute(`"${installerPath}" /s`)
        await execute(`del "${installerPath}"`)
      }
      break
    default:
      throw new Error('Unknown Platform')
  }
}

async function installUnityEditor(
  unityVersion: string,
  unityVersionChangeset: string
): Promise<string> {
  let unityPath = await findUnity(unityVersion)

  if (!unityPath) {
    await executeAtUnityHub(
      `install --version ${unityVersion} --changeset ${unityVersionChangeset}`
    )

    unityPath = await findUnity(unityVersion)
  }

  return unityPath
}

async function installUnityModules(
  unityVersion: string,
  unityModules: string[],
  unityModulesChild: boolean
): Promise<void> {
  const modulesArgs = unityModules
    .map(s => `--module ${s.toLowerCase()}`)
    .join(' ')
  const childModulesArg = unityModulesChild ? '--childModules' : ''
  const stdout = await executeAtUnityHub(
    `install-modules --version ${unityVersion} ${modulesArgs} ${childModulesArg}`
  )
  if (
    !stdout.includes('successfully') &&
    !stdout.includes("it's already installed")
  ) {
    throw new Error('Module Installation Failed')
  }
}

async function findUnity(unityVersion: string): Promise<string> {
  let unityPath = ''

  const output = await executeAtUnityHub('editors --installed')
  const match = output.match(new RegExp(`${unityVersion}.+, installed at (.+)`))

  if (match) {
    unityPath = match[1]

    if (unityPath && process.platform === 'darwin') {
      unityPath += '/Contents/MacOS/Unity'
    }
  }

  return unityPath
}

async function findProjectVersion(projectPath: string): Promise<string[]> {
  const filePath = path.join(projectPath, 'ProjectSettings/ProjectVersion.txt')

  if (fs.existsSync(filePath)) {
    const fileText = fs.readFileSync(filePath, 'utf8')

    const match1 = fileText.match(/m_EditorVersionWithRevision: (.+) \((.+)\)/)

    if (match1) {
      const version = match1[1]
      const changeset = match1[2]
      return [version, changeset]
    }

    const match2 = fileText.match(/m_EditorVersion: (.+)/)

    if (match2) {
      const version = match2[1]
      const changeset = await findVersionChangeset(version)
      return [version, changeset]
    }
  }

  throw new Error(`Project not found at path: ${projectPath}`)
}

async function findVersionChangeset(unityVersion: string): Promise<string> {
  let changeset = ''

  try {
    let versionPageUrl = ''

    if (unityVersion.includes('a')) {
      versionPageUrl = `https://unity3d.com/unity/alpha/${unityVersion}`
    } else if (unityVersion.includes('b')) {
      versionPageUrl = `https://unity3d.com/unity/beta/${unityVersion}`
    } else if (unityVersion.includes('f')) {
      versionPageUrl = `https://unity3d.com/unity/whats-new/${
        unityVersion.match(/[.0-9]+/)?.[0]
      }`
    }

    const pagePath = await tc.downloadTool(versionPageUrl)
    const pageText = fs.readFileSync(pagePath, 'utf8')
    const match =
      pageText.match(new RegExp(`unityhub://${unityVersion}/([a-z0-9]+)`)) ||
      pageText.match(/Changeset:<\/span>[ \n]*([a-z0-9]{12})/)

    changeset = match?.[1] as string
  } catch (error) {
    if (error instanceof Error) core.error(error)
  }

  if (!changeset) {
    throw new Error("Can't find Unity version changeset automatically")
  }

  return changeset
}

async function postInstall(isSelfHosted: boolean): Promise<void> {
  if (process.platform === 'darwin') {
    await execute('mkdir -p "/Library/Application Support/Unity"', {
      sudo: !isSelfHosted
    })
    await execute(
      `chown -R ${process.env.USER} "/Library/Application Support/Unity"`,
      {sudo: !isSelfHosted}
    )
  }
}

async function executeAtUnity(
  unityPath: string,
  args: string
): Promise<string> {
  if (process.platform === 'linux') {
    return await execute(`xvfb-run --auto-servernum "${unityPath}" ${args}`, {
      ignoreReturnCode: true
    })
  } else {
    return await execute(`"${unityPath}" ${args}`, {ignoreReturnCode: true})
  }
}

async function executeAtUnityHub(args: string): Promise<string> {
  switch (process.platform) {
    case 'linux':
      return await execute(
        `xvfb-run --auto-servernum unityhub --headless ${args} --disable-gpu-sandbox`,
        {ignoreReturnCode: true}
      )
    case 'darwin':
      return await execute(
        `"/Applications/Unity Hub.app/Contents/MacOS/Unity Hub" -- --headless ${args}`,
        {
          ignoreReturnCode: true
        }
      )
    case 'win32':
      return await execute(
        `"C:/Program Files/Unity Hub/Unity Hub.exe" -- --headless ${args}`,
        {
          ignoreReturnCode: true
        }
      )
    default:
      throw new Error('Unknown Platform')
  }
}

function getInputArray(name: string): string[] {
  return core
    .getInput(name)
    .split('\n')
    .map(s => s.trim())
    .filter(x => x !== '')
}

async function execute(
  command: string,
  options?: {
    sudo?: boolean
    ignoreReturnCode?: boolean
  }
): Promise<string> {
  let output = ''

  const prefix = options?.sudo === true ? 'sudo ' : ''
  const execOptions = {
    ignoreReturnCode: options?.ignoreReturnCode || false,
    listeners: {
      stdout: (buffer: {toString: () => string}) =>
        (output += buffer.toString())
    }
  }

  await exec.exec(prefix + command, [], execOptions)

  return output
}

run()
