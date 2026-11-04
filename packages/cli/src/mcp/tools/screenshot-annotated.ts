import { pngSize } from '../format.js'
import { imageResult, type ToolResult } from '../result.js'
import { validateRules } from '../rules.js'
import { requirePage } from '../session.js'

export type ScreenshotAnnotatedInput = {
  selector?: string
  rules?: string[]
}

export async function screenshotAnnotatedTool(
  input: ScreenshotAnnotatedInput,
): Promise<ToolResult> {
  const rules = validateRules(input.rules ?? [])
  const image = await requirePage().annotate({
    selector: input.selector,
    rules,
  })

  return imageResult({ ...pngSize(image), bytes: image.length }, image)
}
