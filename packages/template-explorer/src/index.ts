// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { createApp } from './lib/index.js'
import './lib/index.css'

createApp()
  .mount('#app', {
    theme: 'light',
    style: {
      width: '100%',
      height: '100%',
      fontSize: '16px',
      lineHeight: 1.4,
    },
  })
