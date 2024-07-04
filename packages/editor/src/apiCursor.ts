import type { EditorSelectionRange, MarkdanContext, MarkdanSchemaElement } from '@markdan/core'
import { correctionCursorTop, createElement, getRangePosition } from '@markdan/helper'
import { CLASS_NAMES } from './config/dom.config'

export interface EditorCursorApi {
  addCursor: (ranges: Set<EditorSelectionRange>) => void
  onScroll(): void
}

const canvas = document.createElement('canvas')

function getViewLineId(id: string, elements: MarkdanSchemaElement[]) {
  const groupIds = elements.find(el => el.id === id)?.groupIds ?? []

  let viewLineId = id
  let i = groupIds.length

  while (i >= 0) {
    const item = elements.find(el => el.id === groupIds[i])
    if (item?.isBlock) {
      viewLineId = item.id
      break
    }
    i--
  }

  return viewLineId
}

function getCursorPosition(blockId: string, offset: number, ctx: MarkdanContext) {
  const {
    config: {
      containerRect: {
        x,
        y,
      },
    },
    schema: { elements },
    interface: {
      ui: {
        mainViewer,
        lineNumber,
      },
      scrollbar: {
        scrollX,
        scrollY,
      },
    },
  } = ctx

  const rect = getRangePosition(blockId, offset, mainViewer)

  if (!rect) return

  const viewLineId = getViewLineId(blockId, elements)

  let element = mainViewer.querySelector(`[data-id="${viewLineId}"]`)!

  if (element.tagName === 'CODE' && element.querySelector('pre')) {
    element = element.querySelector('pre')!
  }
  if (element.tagName === 'TR') {
    element = element.querySelector('td,th')!
  }

  const computedStyle = getComputedStyle(element)
  const lineNumberWidth = lineNumber ? lineNumber.getBoundingClientRect().width : 0

  const { top } = element.getBoundingClientRect()
  const t = correctionCursorTop(rect.top, top, computedStyle.lineHeight, computedStyle.paddingTop)

  return {
    left: rect.left - x + lineNumberWidth + scrollX,
    top: t + scrollY - y,
    height: parseFloat(computedStyle.lineHeight),
  }
}

function clear(ctx: MarkdanContext) {
  const {
    config: {
      containerRect: { width, height },
    },
    interface: {
      ui: {
        cursor,
      },
    },
  } = ctx
  const cursorList = cursor?.querySelectorAll(`.${CLASS_NAMES.editorCursor}`) ?? []

  cursorList.forEach((cursor) => {
    cursor.remove()
  })

  const c = canvas.getContext('2d')!
  c.clearRect(0, 0, width, height)
}

function handleScroll(ctx: MarkdanContext) {
  const {
    config: {
      containerRect: { width, height },
    },
    interface: {
      ui: {
        cursor,
      },
      scrollbar: {
        scrollX,
        scrollY,
      },
    },
    selection: {
      ranges,
    },
  } = ctx
  const cursorList = cursor?.querySelectorAll<HTMLElement>(`.${CLASS_NAMES.editorCursor}`) ?? []

  cursorList.forEach((cursor) => {
    cursor.style.transform = `translate(${-scrollX}px, ${-scrollY}px)`
  })

  const c = canvas.getContext('2d')!
  c.clearRect(0, 0, width, height)
  ranges.forEach(range => renderRangeRectangles(range, ctx))
}

function addCursor(range: EditorSelectionRange, ctx: MarkdanContext) {
  const pos = getCursorPosition(range.focusBlock, range.focusOffset, ctx)
  if (!pos) return
  const {
    left,
    top,
    height,
  } = pos

  const {
    interface: {
      ui: {
        cursor,
      },
      scrollbar: {
        scrollX,
        scrollY,
      },
    },
  } = ctx

  const oCursor = createElement('div', {
    'class': CLASS_NAMES.editorCursor,
    'data-uid': range.uid,
    'data-id': range.id,
    'style': `left: ${left - 1}px;`
        + `top: ${top}px;`
        + `height: ${height}px;`
        + `transform: translate(${-scrollX}px, ${-scrollY}px);`,
  })

  cursor?.appendChild(oCursor)
}

function renderRangeRectangles(range: EditorSelectionRange, ctx: MarkdanContext) {
  const {
    anchorBlock,
    anchorOffset,
    focusBlock,
    focusOffset,
  } = range.physicsRange

  const {
    config: {
      containerRect: { width },
      gap,
      theme,
    },
    interface: {
      scrollbar: {
        scrollX,
        scrollY,
      },
    },
  } = ctx

  const c = canvas.getContext('2d')!

  const anchorRect = getCursorPosition(anchorBlock, anchorOffset, ctx)
  const focusRect = getCursorPosition(focusBlock, focusOffset, ctx)
  if (!anchorRect || !focusRect) return

  const bg = theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'

  c.save()
  c.translate(-scrollX, -scrollY)
  if (anchorRect.top === focusRect.top) {
    c.beginPath()
    c.fillStyle = bg
    c.fillRect(
      anchorRect.left,
      anchorRect.top,
      focusRect.left - anchorRect.left,
      focusRect.top + focusRect.height - anchorRect.top,
    )
  } else {
    c.beginPath()
    c.moveTo(anchorRect.left, anchorRect.top)
    c.lineTo(width - gap, anchorRect.top)
    c.lineTo(width - gap, focusRect.top)
    c.lineTo(focusRect.left, focusRect.top)
    c.lineTo(focusRect.left, focusRect.top + focusRect.height)
    c.lineTo(0 + gap, focusRect.top + focusRect.height)
    c.lineTo(0 + gap, anchorRect.top + anchorRect.height)
    c.lineTo(anchorRect.left, anchorRect.top + anchorRect.height)
    c.closePath()
    c.fillStyle = bg
    c.fill()
  }
  c.restore()
}

export function createCursorApi(ctx: MarkdanContext): EditorCursorApi {
  canvas.width = ctx.config.containerRect.width
  canvas.height = ctx.config.containerRect.height

  canvas.style.cssText = 'position: absolute; left: 0; top: 0; z-index: 11; pointer-events: none'

  ctx.interface.ui.cursor.appendChild(canvas)

  return {
    addCursor: (ranges: Set<EditorSelectionRange>) => {
      clear(ctx)

      ranges.forEach((range) => {
        addCursor(range, ctx)
        renderRangeRectangles(range, ctx)
      })
    },

    onScroll() {
      handleScroll(ctx)
    },
  }
}
