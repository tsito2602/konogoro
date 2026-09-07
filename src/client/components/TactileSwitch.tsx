import { Bell, BellOff } from "lucide-react";

/** Controlled visual switch; persistence belongs to its caller. */
export function TactileSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label="LINE通知"
      aria-checked={checked}
      disabled={disabled}
      className="tactile-switch"
      data-on={checked}
      data-feedback="none"
      onClick={() => onChange(!checked)}
    >
      <span className="tactile-switch-rays" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="tactile-switch-thumb" aria-hidden="true">
        <Bell className="tactile-bell" />
        <BellOff className="tactile-bell-off" />
      </span>
    </button>
  );
}
