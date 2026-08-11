import { LEARNING_LOOP_PHASES } from '../data/learningLoop'

// Circular diagram of the 12-stage learning loop. Node/label positions are computed with
// trig instead of hand-placed, since there are 12 of them spaced evenly around a ring and
// each label's text-anchor/baseline has to flip depending on which side of the circle it
// sits on.
const CX = 410
const CY = 350
const R = 210
const LABEL_R = 236
const NUM_R = R - 22
const HUB_R = 94
const START_DEG = -90
const GAP_DEG = 3.4
const ARROW_MARKER_ID = 'about-loop-arrow'

const NODES = LEARNING_LOOP_PHASES.flatMap((phase) =>
  phase.steps.map((step) => ({ ...step, phaseKey: phase.key, color: phase.color }))
)
const STEP_DEG = 360 / NODES.length

function angleOf(index) {
  return START_DEG + index * STEP_DEG
}

function pointAt(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)]
}

function arcPath(startDeg, endDeg, radius) {
  const [x0, y0] = pointAt(startDeg, radius)
  const [x1, y1] = pointAt(endDeg, radius)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${radius} ${radius} 0 ${largeArc} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

// Contiguous same-phase nodes share one colored arc segment along the track.
const phaseArcs = []
for (let i = 0; i < NODES.length; ) {
  let j = i
  while (j + 1 < NODES.length && NODES[j + 1].phaseKey === NODES[i].phaseKey) j++
  phaseArcs.push({
    key: NODES[i].phaseKey,
    color: NODES[i].color,
    d: arcPath(angleOf(i) + GAP_DEG, angleOf(j) - GAP_DEG, R),
  })
  i = j + 1
}

// Small dashed arc + arrowhead bridging the last node back to the first, showing the loop repeats.
const returnArcPath = arcPath(
  angleOf(NODES.length - 1) + GAP_DEG,
  angleOf(0) - GAP_DEG + 360,
  R,
)

const nodePlacements = NODES.map((node, index) => {
  const angle = angleOf(index)
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const [dotX, dotY] = pointAt(angle, R)
  const [numX, numY] = pointAt(angle, NUM_R)
  const [labelX, labelY] = pointAt(angle, LABEL_R)
  const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle'
  const baseline = sin > 0.35 ? 'hanging' : sin < -0.35 ? 'auto' : 'middle'
  const dx = anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0
  const dy = baseline === 'hanging' ? 4 : baseline === 'auto' ? -4 : 0
  return {
    ...node,
    dotX: dotX.toFixed(1),
    dotY: dotY.toFixed(1),
    numX: numX.toFixed(1),
    numY: numY.toFixed(1),
    labelX: (labelX + dx).toFixed(1),
    labelY: (labelY + dy).toFixed(1),
    anchor,
    baseline,
  }
})

export default function LearningLoopRing() {
  return (
    <svg
      viewBox="0 80 820 540"
      role="img"
      aria-label="The PATHS learning loop: twelve stages across three phases, Capture and Ideate, Reimagine and Co-create, and Make and Validate, looping back to the start"
      className="about__loop-svg"
    >
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#974400" />
        </marker>
      </defs>

      <circle cx={CX} cy={CY} r={R} className="about__loop-track" />

      {phaseArcs.map((arc, i) => (
        <path key={i} d={arc.d} stroke={arc.color} className="about__loop-arc" />
      ))}

      <path d={returnArcPath} className="about__loop-return" markerEnd={`url(#${ARROW_MARKER_ID})`} />

      {nodePlacements.map((node) => (
        <g key={node.n} className="about__loop-node">
          <circle cx={node.dotX} cy={node.dotY} r="7.5" fill={node.color} className="about__loop-dot" />
          <text x={node.numX} y={node.numY} textAnchor="middle" dominantBaseline="middle" className="about__loop-num">
            {node.n}
          </text>
          <text
            x={node.labelX}
            y={node.labelY}
            textAnchor={node.anchor}
            dominantBaseline={node.baseline}
            className="about__loop-label"
          >
            {node.label}
          </text>
        </g>
      ))}

      <circle cx={CX} cy={CY} r={HUB_R} className="about__loop-hub" />
      <text x={CX} y={CY - 32} textAnchor="middle" className="about__loop-hub-eye">
        Creative Craft
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle" className="about__loop-hub-brand">
        <tspan className="about__loop-hub-brand-p">P</tspan>ATHS
      </text>
      <text x={CX} y={CY + 32} textAnchor="middle" className="about__loop-hub-tag">
        <tspan x={CX} dy="0">Design Thinking</tspan>
        <tspan x={CX} dy="16">
          <tspan className="about__loop-hub-tag-by">by</tspan> Thinking Design
        </tspan>
      </text>
    </svg>
  )
}
