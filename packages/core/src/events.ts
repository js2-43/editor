import type { MarkdanViewBlock } from '@markdan/engine'
import { type Point, clickOutside, isOnlyCtrlKey, throttle } from '@markdan/helper'
import type { MarkdanContext } from './index'

export function registerEventHandler(ctx: MarkdanContext) {
  function handleInput(e: InputEvent) {
    const target = e.target as HTMLTextAreaElement
    const { inputType } = e

    switch (inputType) {
      case 'insertLineBreak':
        e.preventDefault()
        ctx.command.executeCommand('break-line')
        break
      case 'insertCompositionText':
        e.preventDefault()
        break
      default:
        if (target.value) {
          ctx.command.executeCommand('insert', target.value)
        }
        break
    }

    target.value = ''
  }

  function handleEditorFocus() {
    const inputHandler = throttle(handleInput, 8, true)

    setTimeout(() => {
      ctx.interface.ui.virtualInput.focus()

      if (!ctx.focused) {
        ctx.interface.ui.virtualInput.addEventListener('input', inputHandler)
        ctx.focused = true
      }
    })
    ctx.interface.ui.markdan.classList.add('focus')

    clickOutside(ctx.interface.ui.markdan, () => {
      ctx.interface.ui.markdan.classList.remove('focus')
      ctx.interface.ui.virtualInput.blur()
      ctx.interface.ui.virtualInput.removeEventListener('input', inputHandler)
      ctx.focused = false
    })
  }

  function handleKeydown(e: KeyboardEvent) {
    const { key } = e

    switch (key) {
      case 'Backspace':
        ctx.command.executeCommand('delete')
        break
      case 'Tab':
        e.preventDefault()
        ctx.command.executeCommand('insert', '  ')
        break
      case 'ArrowUp':
      case 'ArrowRight':
      case 'ArrowDown':
      case 'ArrowLeft':
        ctx.selection.handleKeyboardSelect(e)
        break
      case 'a':
        if (isOnlyCtrlKey(e)) {
          ctx.selection.handleKeyboardSelect(e)
        }
        break
      case 'z':
      case 'y':
        if (isOnlyCtrlKey(e)) {
          e.preventDefault()
          ctx.command.executeCommand(key === 'z' ? 'undo' : 'redo')
        }
        break
      default:
        break
    }
  }

  function handleMouseDown(e: MouseEvent) {
    ctx.selection.handleMouseDown(e)
  }

  let wheelStartPoint: Point = { x: 0, y: 0 }
  function handleEditorScroll(e: WheelEvent) {
    e.stopPropagation()
    e.preventDefault()

    const { deltaX, deltaY, clientX, clientY } = e

    if (deltaX !== 0 && deltaY !== 0) {
      // 触控板操作
      const diffX = Math.abs(clientX - wheelStartPoint.x)
      const diffY = Math.abs(clientY - wheelStartPoint.y)

      if (diffY > diffX) {
        ctx.emitter.emit('scrollbar:change', {
          x: deltaX,
          action: 'scrollBy',
        })
      } else {
        ctx.emitter.emit('scrollbar:change', {
          y: deltaY,
          action: 'scrollBy',
        })
      }

      wheelStartPoint = { x: clientX, y: clientY }
    } else if (deltaX !== 0) {
      ctx.emitter.emit('scrollbar:change', {
        x: deltaX,
        action: 'scrollBy',
      })
    } else if (deltaY !== 0) {
      ctx.emitter.emit('scrollbar:change', {
        y: deltaY,
        action: 'scrollBy',
      })
    }
  }

  ctx.emitter.on('blocks:change', (viewBlocks: MarkdanViewBlock[]) => {
    ctx.viewBlocks = viewBlocks
  })

  ctx.emitter.on('editor:focus', handleEditorFocus)
  ctx.emitter.on('editor:mouse:down', handleMouseDown)
  ctx.emitter.on('editor:keydown', handleKeydown)

  ctx.emitter.on('editor:scroll', handleEditorScroll)
}
