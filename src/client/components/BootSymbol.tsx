import symbol from "../../../assets/brand/symbol.svg?raw";

export function BootSymbol() {
  return (
    <span
      className="boot-symbol boot-symbol-animated"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: symbol }}
    />
  );
}
