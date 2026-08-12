// Marks a craft whose source photo came from AI co-creation (crafts.image_source =
// 'ai_generated') rather than a direct upload. Same sparkle glyph as CreatePage's
// "Co-Create with AI" method card, reused here as the app's one visual for "AI-made".
export default function AiGeneratedBadge({ className = '' }) {
  return (
    <span className={`ai-badge ${className}`} title="AI-generated image" aria-label="AI-generated image">
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
        <path d="M19 3l.6 1.7L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.3L19 3z" />
      </svg>
    </span>
  )
}
