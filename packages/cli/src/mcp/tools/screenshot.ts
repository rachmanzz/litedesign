import { pngSize } from '../format.js'
import { imageResult, type ToolResult } from '../result.js'
import { requirePage } from '../session.js'

export type ScreenshotInput = {
  selector?: string
  fullPage?: boolean
}

export async function screenshotTool(input: ScreenshotInput): Promise<ToolResult> {
  const image = await requirePage().screenshot(input)
  return imageResult({ ...pngSize(image), bytes: image.length }, image)
}
