import { type MarkdanContext } from '@markdan/core'
import { type Rectangle } from '@markdan/helper'
import type { AffectedViewLine } from './view'

export interface MarkdanRenderedElement extends Rectangle {
  id: string
  lineHeight: number
  element: HTMLElement
}

export function patchRenderedElements(affectedElements: Set<[HTMLElement | null, ...AffectedViewLine]>, ctx: MarkdanContext): MarkdanRenderedElement[] {
  const {
    config: {
      containerRect: {
        x,
      },
      style: {
        lineHeight,
      },
    },
    interface: {
      scrollbar: {
        scrollX,
      },
      ui: { mainViewer },
    },
    viewBlocks,
    renderedElements,
  } = ctx

  let { lastTop = 0 } = ctx.config

  affectedElements.forEach(([oElement, id, behavior, previewId]) => {
    if (behavior === 'delete') {
      const originalElementIdx = renderedElements.findIndex(item => item.id === id)
      if (originalElementIdx === -1) {
        throw new Error('数据结构错误')
      }
      const { y, height, element } = renderedElements[originalElementIdx]

      // 由于移除了一行，之后所有行都需要更新一下 y 值
      renderedElements.forEach((el) => {
        if (el.y > y) {
          el.y -= height
        }
      })

      renderedElements.splice(originalElementIdx, 1)
      element.remove()

      lastTop -= height
    } else if (behavior === 'add') {
      const { width, height, left } = oElement!.getBoundingClientRect()
      const originalElementIdx = renderedElements.findIndex(item => item.id === previewId)

      if (originalElementIdx === -1) {
        // 找不到挂载位置，尝试查询 view-block 中的下一项
        const viewBlockIndex = viewBlocks.findIndex(item => item.id === previewId)
        if (viewBlockIndex !== -1) {
          const nextIndex = renderedElements.findIndex(item => item.id === viewBlocks[viewBlockIndex + 2].id)
          if (nextIndex !== -1) {
            const y = renderedElements[nextIndex].y

            // 之后所有行都需要增加一下 y 值
            renderedElements.slice(nextIndex).forEach((el) => {
              el.y += height
            })

            renderedElements.splice(nextIndex, 0, {
              id,
              x: left - x + scrollX,
              y,
              width,
              height,
              lineHeight,
              element: oElement!,
            })
            oElement!.style.top = `${y}px`
          } else {
            renderedElements.splice(nextIndex, 0, {
              id,
              x: left - x + scrollX,
              y: lastTop,
              width,
              height,
              lineHeight,
              element: oElement!,
            })
            oElement!.style.top = `${lastTop}px`
          }
        } else {
          // 空白页面增加数据
          renderedElements.push({
            id,
            x: left - x + scrollX,
            y: 0,
            width,
            height,
            lineHeight,
            element: oElement!,
          })
          oElement!.style.top = `${0}px`
        }
      } else {
        // 由于增加了一行，之后所有行都需要更新一下 y 值
        const prevElement = renderedElements[originalElementIdx]
        renderedElements.forEach((el) => {
          if (el.y > prevElement.y) {
            el.y += height
          }
        })
        renderedElements.splice(originalElementIdx + 1, 0, {
          id,
          x: left - x + scrollX,
          y: prevElement.y + prevElement.height,
          width,
          height,
          lineHeight,
          element: oElement!,
        })

        oElement!.style.top = `${prevElement.y + prevElement.height}px`
      }
      lastTop += height
    } else {
      const { width, height: newHeight } = oElement!.getBoundingClientRect()

      const originalElement = renderedElements.find(item => item.id === id)
      if (!originalElement) {
        throw new Error('数据结构错误')
      }

      // 对比高度是否发生了变化
      const diffHeight = newHeight - originalElement.height
      if (diffHeight !== 0) {
        renderedElements.forEach((el) => {
          if (el.y > originalElement.y) {
            el.y += diffHeight
          }
        })
      }

      originalElement.width = width
      originalElement.height = newHeight

      originalElement.element = oElement!

      lastTop += diffHeight
      oElement!.style.top = `${originalElement.y}px`
    }
  })

  ctx.config.lastTop = lastTop

  mainViewer.style.height = `${lastTop}px`

  return renderedElements
}
