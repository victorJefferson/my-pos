import { useEffect } from 'react'
import {
  THEME_LIQUID_GLASS,
  LG_FILTER_ID,
  LG_FILTER_CHROMA_ID,
  liquidGlassCssVars,
} from '../theme/constants'

/**
 * SVG filter defs for Liquid Glass.
 * Displacement warps specular sheen layers (applied on ::after overlays) so
 * parent backdrop-filter stays intact and still samples what’s behind.
 */
export default function LiquidGlassFilters({ theme }) {
  const vars = liquidGlassCssVars()
  const scale = theme === THEME_LIQUID_GLASS ? (Number(vars['--lg-refract']) || 12) : 12

  useEffect(() => {
    const node = document.getElementById(`${LG_FILTER_ID}-map`)
    if (node) node.setAttribute('scale', String(scale))
  }, [scale])

  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', overflow: 'hidden', pointerEvents: 'none' }}
    >
      <defs>
        <filter
          id={LG_FILTER_ID}
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.05"
            numOctaves="3"
            seed="11"
            result="noise"
          />
          <feDisplacementMap
            id={`${LG_FILTER_ID}-map`}
            in="SourceGraphic"
            in2="noise"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter
          id={LG_FILTER_CHROMA_ID}
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feOffset in="SourceGraphic" dx="0.8" dy="0" result="rShift" />
          <feOffset in="SourceGraphic" dx="-0.8" dy="0" result="bShift" />
          <feComponentTransfer in="rShift" result="rOnly">
            <feFuncG type="discrete" tableValues="0" />
            <feFuncB type="discrete" tableValues="0" />
            <feFuncA type="linear" slope="0.4" />
          </feComponentTransfer>
          <feComponentTransfer in="bShift" result="bOnly">
            <feFuncR type="discrete" tableValues="0" />
            <feFuncG type="discrete" tableValues="0" />
            <feFuncA type="linear" slope="0.4" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="rOnly" mode="screen" result="withR" />
          <feBlend in="withR" in2="bOnly" mode="screen" />
        </filter>
      </defs>
    </svg>
  )
}
