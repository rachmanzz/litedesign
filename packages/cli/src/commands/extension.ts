import { EXT_DIR } from '../paths.js'
import { setup } from './setup.js'

export async function extensionCommand(args: string[]): Promise<void> {
  const sub = args[0]

  if (sub === 'path') {
    console.log(EXT_DIR)
    return
  }

  if (sub === 'update') {
    await setup()
    return
  }

  throw new Error('usage: litedesign extension <path|update>')
}
