// The PATHS learning loop: 12 stages grouped into 3 phases, from capturing a craft object to
// producing and validating its redesign. Single source of truth for AboutPage's ring diagram
// (LearningLoopRing) and its text breakdown, so the two views can't drift out of sync.
export const LEARNING_LOOP_PHASES = [
  {
    key: 'celadon',
    color: '#3f9b83',
    title: 'A · Capture & Ideate',
    subtitle: 'From observing to ideating',
    steps: [
      { n: '01', label: 'Observing', desc: 'studying the source piece' },
      { n: '02', label: 'Imaging', desc: 'capturing photos and scans' },
      { n: '03', label: 'Digitizing', desc: 'building the 3D model' },
      { n: '04', label: 'Twinning', desc: 'creating the digital twin' },
      { n: '05', label: 'Ideating', desc: 'sketching new directions' },
    ],
  },
  {
    key: 'violet',
    color: '#6c5ecb',
    title: 'B · Reimagine & Co-create',
    subtitle: 'From augmenting to co-creating',
    steps: [
      { n: '06', label: 'Augmenting', desc: 'layering AR onto the twin' },
      { n: '07', label: 'Re-designing', desc: 'reshaping the digital form' },
      { n: '08', label: 'Co-creating', desc: 'designing with the community' },
    ],
  },
  {
    key: 'terra',
    color: '#974400',
    title: 'C · Make & Validate',
    subtitle: 'From ratifying to validating',
    steps: [
      { n: '09', label: 'Ratifying', desc: 'locking the final design' },
      { n: '10', label: 'Re-casting', desc: 'remaking the physical mould' },
      { n: '11', label: 'Crafting', desc: 'pottering the finished piece' },
      { n: '12', label: 'Validating', desc: 'checking it against intent' },
    ],
  },
]
