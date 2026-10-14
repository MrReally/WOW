import { Textarea } from "../../../ui-kit/index.ts";

interface ProjectNoteFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProjectNoteField({ value, onChange }: ProjectNoteFieldProps) {
  return (
    <label className="project-form-note">
      <span className="project-form-note__label">Общая заметка</span>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Важная информация для команды и планирования"
      />
    </label>
  );
}
