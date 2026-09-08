import { bootMotionElapsed } from "../boot-motion";
import symbol from "../../../assets/brand/symbol.svg?raw";

export function BootSymbol() {
  // Continue the HTML boot animation when React replaces the initial markup.
  const elapsed = bootMotionElapsed();
  return (
    <span
      className="boot-symbol boot-symbol-animated"
      aria-hidden="true"
      style={{ animationDelay: `${-elapsed}ms` }}
      dangerouslySetInnerHTML={{ __html: symbol }}
    />
  );
}
