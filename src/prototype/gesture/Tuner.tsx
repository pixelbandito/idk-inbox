// A labelled range slider for live-tuning a gesture parameter. These rigs exist
// to *feel out* thresholds and timings, so every knob is adjustable on the fly.

export function Tuner({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="tuner">
      <span className="tuner__name">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="tuner__value">
        {value}
        {unit}
      </span>
    </label>
  );
}
