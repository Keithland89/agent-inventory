import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Answer } from './AskPanel'

describe('Answer', () => {
  it('renders paragraphs, lists and bold, and escapes everything else', () => {
    const html = renderToStaticMarkup(<Answer text={'Retire **3** agents.\n\n- Alpha <b>x</b>\n- Beta\n1. One\n2) Two\n## Next'} />)
    expect(html).toBe(
      '<div class="ask-answer"><p>Retire <b>3</b> agents.</p><ul><li>Alpha &lt;b&gt;x&lt;/b&gt;</li><li>Beta</li></ul><ol><li>One</li><li>Two</li></ol><p class="ask-h">Next</p></div>',
    )
  })
})
