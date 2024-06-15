import type { MarkdanContext, MarkdanSchemaElement } from '@markdan/core'

export interface MarkdanViewBlock extends MarkdanSchemaElement {
  children?: MarkdanViewBlock[]
}

/**
 * - 受影响行的 id
 * - 行为
 * - 前一行的 id
 */
export type AffectedViewLine = [
  string,
  'change' | 'add' | 'delete',
  string?,
]

export function parseSchema(ctx: MarkdanContext) {
  const affectedViewLines = new Set<AffectedViewLine>() // 受到影响的渲染行

  const {
    schema: { elements, affectedElements },
    viewBlocks,
  } = ctx

  // 通过一份新的 elements + 一个受影响的 elements 集合
  // 再结合旧的 view blocks
  // 生成新的 view blocks
  // 同时生成一份受影响的 viewLines 集合
  const deleteIds = new Set()
  const addIds = new Set()
  affectedElements.forEach(({
    id,
    behavior,
    prevIndex,
    groupIds,
  }) => {
    if (behavior === 'delete') {
      const parent = getViewBlock(groupIds!, viewBlocks)
      parent.splice(parent.findIndex(el => el.id === id), 1)
      if (!groupIds![0]) {
        affectedViewLines.add([id, 'delete'])
        deleteIds.add(id)
      } else if (!deleteIds.has(groupIds![0]) && !addIds.has(groupIds![0])) {
        affectedViewLines.add([groupIds![0], 'change'])
      }
    } else {
      const idx = elements.findIndex(item => item.id === id)
      if (idx === -1) return
      const element = elements[idx]

      // 找到受影响元素在 viewBlocks 中的父级元素
      // 需要注意这是一个 children 的引用，操作时需要采用对原数组产生影响的方法 splice / push 等
      const parent = getViewBlock(element.groupIds, viewBlocks)
      if (behavior === 'change') {
        const oldElementIdx = parent.findIndex(item => item.id === element.id)
        if (oldElementIdx === -1) {
          parent.unshift({ ...element })
        } else {
          const oldElement = parent[oldElementIdx]

          parent.splice(oldElementIdx, 1, {
            ...element,
            ...oldElement.children
              ? { children: oldElement.children }
              : null,
          })
        }
        if (!deleteIds.has(element.groupIds[0] ?? element.id) && !addIds.has(element.groupIds[0] ?? element.id)) {
          affectedViewLines.add([element.groupIds[0] ?? element.id, 'change'])
        }
      } else {
        if (prevIndex === -1) {
          parent.push({ ...element })
        } else {
          // 在 parent 中寻找前一个 element
          const previewViewBlockIndex = parent.findIndex(item => item.id === elements[prevIndex!]?.id)

          if (previewViewBlockIndex === -1) {
            // 找不到前一个元素，说明他前一个元素不在当前的块中
            parent.push({ ...element })
          } else {
            // 找到则在其后面插入
            parent.splice(previewViewBlockIndex + 1, 0, { ...element })
          }
        }
        if (!element.groupIds[0]) {
          // 新增时需要知道一个位置
          const anchorViewLineId = elements[idx - 1]?.groupIds?.[0] ?? elements[idx - 1]?.id
          affectedViewLines.add([element.id, 'add', anchorViewLineId])
          addIds.add(element.id)
        } else if (!deleteIds.has(element.groupIds[0]) && !addIds.has(element.groupIds[0])) {
          affectedViewLines.add([element.groupIds[0], 'change'])
        }
      }
    }
  })

  affectedElements.clear()

  // affectedViewLines.forEach((item) => {
  //   if (item[1] === 'change' && (deleteIds.has(item[0]) || addIds.has(item[0]))) {
  //     affectedViewLines.delete(item)
  //   }
  // })

  return affectedViewLines
}

function getViewBlock(groupIds: string[], viewBlocks: MarkdanViewBlock[]) {
  const len = groupIds.length
  if (!len) return viewBlocks

  let parent = viewBlocks
  let idx = 0
  let item: MarkdanViewBlock

  while (idx < len) {
    item = parent.find(sub => sub.id === groupIds[idx])!

    parent = item.children ?? (item.children = [])

    idx++
  }

  return parent
}
