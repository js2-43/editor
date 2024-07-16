import type { MarkdanContext } from '@markdan/core'
import { EditorSelectionRange } from '@markdan/core'
import { createElement } from '@markdan/helper'
import { CLASS_NAMES } from './config/dom.config'

export interface EditorCursorApi {
  addCursor: (ranges: Set<EditorSelectionRange>) => void
  onScroll(): void
}

function clear(ctx: MarkdanContext) {
  const {
    config: {
      containerRect: { width, height },
    },
    interface: {
      ui: {
        cursor,
        cursorCanvas,
      },
    },
  } = ctx
  const cursorList = cursor?.querySelectorAll(`.${CLASS_NAMES.editorCursor}`) ?? []

  cursorList.forEach((cursor) => {
    cursor.remove()
  })

  const c = cursorCanvas.getContext('2d')!
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
        cursorCanvas,
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

  const c = cursorCanvas.getContext('2d')!
  c.clearRect(0, 0, width, height)
  ranges.forEach(range => renderRangeRectangles(range, ctx))
}

function addCursor(range: EditorSelectionRange, ctx: MarkdanContext) {
  const pos = EditorSelectionRange.getCursorPosition(range.focusBlock, range.focusOffset, ctx)
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

function renderRangeRectangles({ rangeArea }: EditorSelectionRange, ctx: MarkdanContext) {
  const {
    config: {
      theme,
    },
    interface: {
      scrollbar: {
        scrollX,
        scrollY,
      },
      ui: {
        cursorCanvas,
      },
    },
  } = ctx

  const c = cursorCanvas.getContext('2d')!

  if (!rangeArea.length) return

  const bg = theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'

  c.save()
  c.translate(-scrollX, -scrollY)

  c.fillStyle = bg
  rangeArea.forEach(([{ x: x1, y: y1 }, { x: x2, y: y2 }]) => {
    c.beginPath()
    c.fillRect(x1, y1, x2 - x1, y2 - y1)
  })

  c.restore()
}

export function createCursorApi(ctx: MarkdanContext): EditorCursorApi {
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
