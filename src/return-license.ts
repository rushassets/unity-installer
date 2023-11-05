import * as core from '@actions/core'
import * as exec from '@actions/exec'

async function run(): Promise<void> {
  try {
    const unityReturnLicense = core.getBooleanInput('unity-return-license')

    if (unityReturnLicense) {
      const unityPath = process.env?.UNITY_PATH ?? ''
      const unityUsername = core.getInput('unity-username')
      const unityPassword = core.getInput('unity-password')

      if (unityUsername && unityPassword) {
        await executeAtUnity(
          unityPath,
          `-batchmode -nographics -quit -logFile "-" -projectPath "?" -returnlicense -username "${unityUsername}" -password "${unityPassword}"`
        )
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
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
