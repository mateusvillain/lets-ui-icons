import { render, SearchTextbox, Toggle } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import '!./styles.css'
import { allBaseNames, categories, iconsData } from './icons-data'
import type { InsertIconHandler } from './types'

const brandNames = new Set(categories.brand)

function getIconKey(baseName: string, isSolid: boolean): string {
  const solidKey = `${baseName}-solid`
  return isSolid && solidKey in iconsData ? solidKey : baseName
}

function Plugin() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSolid, setIsSolid] = useState(false)
  const [showBrand, setShowBrand] = useState(false)

  const filteredIcons = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return allBaseNames.filter((name) => {
      if (!showBrand && brandNames.has(name)) return false
      if (q && !name.includes(q)) return false
      return true
    })
  }, [searchQuery, showBrand])

  function handleClick(baseName: string) {
    const key = getIconKey(baseName, isSolid)
    emit<InsertIconHandler>('INSERT_ICON', { iconName: key, svgString: iconsData[key] })
  }

  return (
    <div class="plugin-root">
      <div class="plugin-header">
        <SearchTextbox
          onValueInput={setSearchQuery}
          placeholder="Search icons…"
          value={searchQuery}
        />
        <div class="controls-row">
          <div class="variant-toggle">
            <span
              class={`toggle-label ${!isSolid ? 'toggle-label--active' : 'toggle-label--inactive'}`}
            >
              Outline
            </span>
            <Toggle onValueChange={setIsSolid} value={isSolid}>
              {''}
            </Toggle>
            <span
              class={`toggle-label ${isSolid ? 'toggle-label--active' : 'toggle-label--inactive'}`}
            >
              Solid
            </span>
          </div>

          <div class="brand-toggle">
            <span
              class={`toggle-label ${showBrand ? 'toggle-label--active' : 'toggle-label--inactive'}`}
            >
              Brand
            </span>
            <Toggle onValueChange={setShowBrand} value={showBrand}>
              {''}
            </Toggle>
          </div>
        </div>
      </div>

      <div class="icon-grid">
        {filteredIcons.length === 0 ? (
          <div class="icon-empty">No icons found for "{searchQuery}"</div>
        ) : (
          filteredIcons.map((baseName) => {
            const key = getIconKey(baseName, isSolid)
            const svg = iconsData[key]
            return (
              <div
                key={key}
                class="icon-cell"
                title={key}
                onClick={() => handleClick(baseName)}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

export default render(Plugin)
