import { type ToolResult, textResult } from '../result.js'
import { requirePage } from '../session.js'

export type MeasureInput = {
  selector: string
}

export async function measureTool(input: MeasureInput): Promise<ToolResult> {
  const measured = await requirePage().measure(input.selector)
  return textResult(measured)
}
