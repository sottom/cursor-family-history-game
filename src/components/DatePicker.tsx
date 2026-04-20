export function DatePicker({
  value,
  onChange,
}: {
  value?: string
  onChange: (next?: string) => void
}) {
  return (
    <input
      type="date"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={{
        width: '100%',
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxSizing: 'border-box',
      }}
    />
  )
}
