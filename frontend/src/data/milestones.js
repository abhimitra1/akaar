// Progress against the six operational stages + pilot defined in the PATHS whitepaper
// (public/whitepaper.html §3.2, §9). Status reflects what's actually shipped in this app,
// not aspiration — kept honest on purpose since the whitepaper itself is explicit that
// PATHS is pre-deployment (§10, "No empirical validation yet"). Update a status here only
// when the underlying feature actually changes.
export const MILESTONES = [
  {
    status: 'done',
    stage: 'Stage 1',
    title: 'Observing & Digitizing',
    desc: 'Photograph a craft and AI reconstructs it into a 3D digital twin.',
  },
  {
    status: 'done',
    stage: 'Stage 2',
    title: 'Ideating & Co-creating',
    desc: 'Reshape the twin with AI-assisted redesign — every result keeps a visible link back to what it was based on.',
  },
  {
    status: 'in-progress',
    stage: 'Stage 3',
    title: 'Twinning & Ratifying',
    desc: 'The design freezes into a twin at real-world scale and can be published. Formal artisan commissioning and payment-at-approval is still ahead.',
  },
  {
    status: 'done',
    stage: 'Stage 4',
    title: 'Augmenting in AR',
    desc: 'View the twin in AR at true scale, on your own device.',
  },
  {
    status: 'upcoming',
    stage: 'Stage 5',
    title: 'Re-casting & Crafting',
    desc: 'The human-only zone: remaking the piece by hand against the AR reference. Not yet connected to a working artisan cluster.',
  },
  {
    status: 'upcoming',
    stage: 'Stage 6',
    title: 'Validating',
    desc: 'Computer vision compares the fired piece to its twin and certifies the match. Not yet built.',
  },
  {
    status: 'upcoming',
    stage: 'The pilot',
    title: 'A pre-registered cluster pilot',
    desc: 'A twelve-month, single-cluster study testing six falsifiable hypotheses about rework, payment timing, and price. Not yet started.',
  },
]
