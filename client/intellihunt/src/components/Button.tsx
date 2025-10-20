import { ReactNode } from "react";

export default function Button({
  children,
  onClick,
  href,
  target,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  target?: "_blank";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " +
    "bg-blue-600 hover:bg-blue-500 text-white transition";
  
  const disabledStyles = disabled 
    ? "opacity-50 cursor-not-allowed bg-gray-600 hover:bg-gray-600" 
    : "";
  
  if (href) {
    return (
      <a className={`${base} ${disabledStyles} ${className}`} href={href} target={target} rel={target === "_blank" ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <button 
      type="button" 
      onClick={disabled ? undefined : onClick} 
      disabled={disabled}
      className={`${base} ${disabledStyles} ${className}`}
    >
      {children}
    </button>
  );
}
