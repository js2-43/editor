import type { MarkdanContext } from '@markdan/core'

import { parseSchema } from './view'
import { handleElementsSizeChange } from './render'

export function createEngineApi(ctx: MarkdanContext) {
  ctx.emitter.on('schema:change', () => {
    const affectedViewLines = parseSchema(ctx)

    ctx.emitter.emit('blocks:change', ctx.viewBlocks)
    ctx.emitter.emit('render', affectedViewLines)
  })

  ctx.emitter.on('img:load:success', (id: string) => {
    handleElementsSizeChange([id], ctx)
  })

  ctx.emitter.on('img:load:failed', (_id: string) => {
    // @todo - 处理图片加载失败
  })
}
