import { createRandomId } from '@markdan/helper'
import type { HistoryRecordItem } from './history'
import type { MarkdanContext } from '.'

export interface MarkdanSchemaElement extends Record<string, any> {
  id: string
  version: number
  versionNonce: number
  updated: number
  // isDeleted: boolean

  isContainer: boolean
  isBlock: boolean
  isSymbol: boolean

  type: string /** ElementType */
  groupIds: string[]
  content: string
  attrs?: Record<string, string>
}

let version = 1

export interface AffectedElement {
  id: string
  behavior: 'add' | 'change' | 'delete'
  prevIndex?: number
  groupIds?: string[]
}

export function createSchemaApi(ctx: MarkdanContext) {
  const elements: MarkdanSchemaElement[] = []
  const affectedElements = new Set<AffectedElement>()

  let trace = true

  function createElement<T extends string>(
    type: T,
    groupIds: string[] = [],
    content = '',
    props: Partial<Pick<MarkdanSchemaElement, 'attrs' | 'isContainer' | 'isBlock' | 'isSymbol'>> = {},
  ): MarkdanSchemaElement {
    const {
      attrs,
      isContainer = false,
      isBlock = false,
      isSymbol = false,
    } = props

    return {
      id: createRandomId(),
      type,
      groupIds,
      content,
      version: version++,
      versionNonce: Math.random() * 10,
      updated: Date.now(),
      attrs,
      isContainer,
      isBlock,
      isSymbol,
    }
  }

  function appendBefore<T extends MarkdanSchemaElement>(element: T, id: T['id']): T {
    const idx = elements.findIndex(i => i.id === id)
    if (idx === -1) {
      throw new Error(`Cannot find element(${id})`)
    }

    trace && ctx.history.record([{
      action: 'add',
      element,
      index: Math.max(0, idx - 1),
      ranges: [...ctx.selection.ranges.values()].map(({ id, anchorBlock, anchorOffset, focusBlock, focusOffset }) => ({ id, anchorBlock, anchorOffset, focusBlock, focusOffset })),
      currentRangeId: ctx.selection.currentRange?.id,
    }])

    affectedElements.add({
      id: element.id,
      behavior: 'add',
      prevIndex: Math.max(0, idx - 1),
    })

    elements.splice(idx, 0, element)

    return element
  }

  function appendAfter<T extends MarkdanSchemaElement>(element: T, id: T['id']): T {
    const idx = elements.findIndex(i => i.id === id)
    if (idx === -1) {
      throw new Error(`Cannot find element(${id})`)
    }

    // 记录操作
    trace && ctx.history.record([{
      action: 'add',
      element: { ...element },
      index: idx,
      ranges: [...ctx.selection.ranges.values()].map(({ id, anchorBlock, anchorOffset, focusBlock, focusOffset }) => ({ id, anchorBlock, anchorOffset, focusBlock, focusOffset })),
      currentRangeId: ctx.selection.currentRange?.id,
    }])

    affectedElements.add({
      id: element.id,
      behavior: 'add',
      prevIndex: idx,
    })

    elements.splice(Math.min(elements.length, idx + 1), 0, element)

    return element
  }

  function append<T extends MarkdanSchemaElement>(element: T): T {
    affectedElements.add({
      id: element.id,
      behavior: 'add',
      prevIndex: elements.length - 1,
    })

    // 记录操作
    trace && ctx.history.record([{
      action: 'add',
      element: { ...element },
      index: elements.length - 1,
      ranges: [...ctx.selection.ranges.values()].map(({ id, anchorBlock, anchorOffset, focusBlock, focusOffset }) => ({ id, anchorBlock, anchorOffset, focusBlock, focusOffset })),
      currentRangeId: ctx.selection.currentRange?.id,
    }])

    elements.push(element)

    return element
  }

  function replace<T extends MarkdanSchemaElement>(element: T, id: T['id']): T {
    const idx = elements.findIndex(item => item.id === id)
    if (idx === -1) {
      throw new Error('数据结构错误')
    }

    affectedElements.add({
      id: element.id,
      behavior: 'change',
    })

    // 记录操作
    if (trace) {
      ctx.history.record([{
        action: 'change',
        element: { ...element },
        oldElement: { ...elements[idx] },
        ranges: [...ctx.selection.ranges.values()].map(({ id, anchorBlock, anchorOffset, focusBlock, focusOffset }) => ({ id, anchorBlock, anchorOffset, focusBlock, focusOffset })),
        currentRangeId: ctx.selection.currentRange?.id,
      }])
    }

    elements.splice(idx, 1, element)

    return element
  }

  function splice<T extends MarkdanSchemaElement>(start: number, deleteCount: number, ...items: T[]) {
    const deleteIds = new Set()

    const historyRecords: HistoryRecordItem[] = []

    elements.slice(start, start + deleteCount).forEach((element, index) => {
      if (!deleteIds.has(element.id) && !element.groupIds.some(id => deleteIds.has(id))) {
        deleteIds.add(element.id)
        affectedElements.add({
          id: element.id,
          behavior: 'delete',
          groupIds: element.groupIds,
        })

        // 记录操作
        trace && historyRecords.push({
          action: 'delete',
          element: { ...element },
          index: start,
          offset: index,
          ranges: [...ctx.selection.ranges.values()].map(({ id, anchorBlock, anchorOffset, focusBlock, focusOffset }) => ({ id, anchorBlock, anchorOffset, focusBlock, focusOffset })),
          currentRangeId: ctx.selection.currentRange?.id,
        })

        // 删除与其相关的选区
        ctx.selection.ranges.forEach((range) => {
          if (range.anchorBlock === element.id || range.focusBlock === element.id) {
            ctx.selection.removeRange(range)
          }
        })
      }
    })
    elements.splice(start, deleteCount, ...items)
    items.forEach((item, index) => {
      affectedElements.add({
        id: item.id,
        behavior: 'add',
        prevIndex: start + index - 1,
      })

      // 记录操作
      trace && historyRecords.push({
        action: 'add',
        element: { ...item },
        index: start + index - 1,
        ranges: [...ctx.selection.ranges.values()].map(({ id, anchorBlock, anchorOffset, focusBlock, focusOffset }) => ({ id, anchorBlock, anchorOffset, focusBlock, focusOffset })),
        currentRangeId: ctx.selection.currentRange?.id,
      })
    })
    trace && ctx.history.record(historyRecords)
  }

  return {
    elements,
    affectedElements,

    setTrace(val: boolean) {
      trace = val
    },

    createElement,
    append,
    appendBefore,
    appendAfter,
    splice,
    replace,
  }
}

export type MarkdanSchema = ReturnType<typeof createSchemaApi>
