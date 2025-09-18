import { ReactNode } from "react";

export default function Button({
  children,
  onClick,
  href,
  target,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  target?: "_blank";
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " +
    "bg-blue-600 hover:bg-blue-500 text-white transition";
  if (href) {
    return (
      <a className={`${base} ${className}`} href={href} target={target} rel={target === "_blank" ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${base} ${className}`}>
      {children}
    </button>
  );
}
