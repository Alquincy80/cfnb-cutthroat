import { createElement } from "react";

const TOP_SAFE_AREA_SCRIM_HEIGHT =
  "calc(var(--twsa-safe-area-inset-top) + min(2rem, var(--twsa-safe-area-inset-top)))";
const TOP_SAFE_AREA_INSET_HEIGHT = "var(--twsa-safe-area-inset-top)";
const TOP_SAFE_AREA_GRADIENT_MASK =
  "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.99) 10%, rgba(0, 0, 0, 0.96) 20%, rgba(0, 0, 0, 0.90) 30%, rgba(0, 0, 0, 0.80) 40%, rgba(0, 0, 0, 0.67) 50%, rgba(0, 0, 0, 0.52) 60%, rgba(0, 0, 0, 0.36) 70%, rgba(0, 0, 0, 0.20) 80%, rgba(0, 0, 0, 0.08) 90%, rgba(0, 0, 0, 0) 100%)";

/**
 * Fixed top safe-area protection for phones without a top-extending header.
 * Covers the device status-bar inset with a small fade whose height
 * collapses to zero on desktop. (Standalone copy of the component the
 * original Muse space got from @hatch/space-sdk/client.)
 */
export function SafeAreaTopScrim({
  variant = "gradient",
  backgroundColor,
  zIndex = 40,
  className,
  style,
  ...props
}: {
  variant?: "gradient" | "inset" | "blur";
  backgroundColor?: string;
  zIndex?: number;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}) {
  const resolvedBackgroundColor =
    backgroundColor ?? style?.backgroundColor ?? "var(--bg)";
  const managedStyle: React.CSSProperties = {
    ...style,
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex,
    pointerEvents: "none",
    height:
      variant === "gradient"
        ? TOP_SAFE_AREA_SCRIM_HEIGHT
        : TOP_SAFE_AREA_INSET_HEIGHT,
    backgroundColor: resolvedBackgroundColor,
  };
  if (variant === "gradient") {
    managedStyle.maskImage = TOP_SAFE_AREA_GRADIENT_MASK;
    managedStyle.WebkitMaskImage = TOP_SAFE_AREA_GRADIENT_MASK;
  } else if (variant === "blur") {
    managedStyle.backdropFilter = style?.backdropFilter ?? "blur(12px)";
    managedStyle.WebkitBackdropFilter =
      style?.WebkitBackdropFilter ?? "blur(12px)";
  }
  return createElement("div", {
    ...props,
    "aria-hidden": (props["aria-hidden"] as boolean | undefined) ?? true,
    className,
    style: managedStyle,
  });
}
