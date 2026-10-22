// Renders a module's form fields from its config — grouped into titled sections when the config has `groups`.
// Optional: errors { key: message } shown under each field, locked [keys] shown read-only (e.g. a student's roll number).
function Field({ field, value, onChange, error, locked }) {
  const label = <span>{field.label}{field.required ? ' *' : ''}{locked ? <em className="locked-tag">Fixed</em> : null}</span>
  const className = `form-control ${field.wide ? 'full' : ''} ${error ? 'has-error' : ''}`
  const common = { id: `field-${field.key}`, name: field.key, disabled: locked || undefined, 'aria-invalid': error ? true : undefined }
  const hint = error ? <small className="field-error">{error}</small> : null
  if (field.type === 'select') {
    return (
      <label className={className}>
        {label}
        <select {...common} value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={field.required}>
          <option value="">Select {field.label.toLowerCase()}</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        {hint}
      </label>
    )
  }
  if (field.type === 'textarea') {
    return (
      <label className={className}>
        {label}
        <textarea {...common} rows={field.rows || 4} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} required={field.required} />
        {hint}
      </label>
    )
  }
  const isPercent = field.type === 'percent'
  const type = isPercent ? 'number' : field.format === 'phone' ? 'tel' : field.type || 'text'
  return (
    <label className={className}>
      {label}
      <span className={isPercent ? 'input-suffix' : undefined}>
        <input
          {...common}
          type={type}
          step={isPercent ? '0.1' : field.step}
          min={isPercent ? 0 : field.min}
          max={isPercent ? 100 : field.max}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          inputMode={field.format === 'phone' ? 'tel' : undefined}
        />
        {isPercent && <em aria-hidden="true">%</em>}
      </span>
      {hint}
    </label>
  )
}

export default function RecordFields({ config, values, onChange, errors = {}, locked = [] }) {
  const update = (key) => (value) => onChange(key, value)
  const field = (item) => <Field key={item.key} field={item} value={values[item.key]} onChange={update(item.key)} error={errors[item.key]} locked={locked.includes(item.key)} />
  if (!config.groups?.length) {
    return <div className="form-grid">{config.fields.map(field)}</div>
  }
  return (
    <div className="form-sections">
      {config.groups.map((group) => {
        const fields = config.fields.filter((field) => (field.group || config.groups[0].key) === group.key)
        if (!fields.length) return null
        return (
          <fieldset key={group.key} className="form-section">
            <legend>{group.title}</legend>
            <div className="form-grid">{fields.map(field)}</div>
          </fieldset>
        )
      })}
    </div>
  )
}
