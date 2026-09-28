import Select from './Select'

// Xtream ratings are a 0–10 scale (same one the home carousel's MIN_RATING/8.5 and the ★ badges on
// posters already use) — these thresholds match that, not a 1–5 star count.
const THRESHOLDS = [7, 8, 9]

interface RatingFilterProps {
  value: number
  onChange: (value: number) => void
}

export default function RatingFilter({ value, onChange }: RatingFilterProps) {
  return (
    <Select
      label="Nota mínima"
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={[{ value: '0', label: 'Qualquer nota' }, ...THRESHOLDS.map((t) => ({ value: String(t), label: `★ ${t}+` }))]}
    />
  )
}
