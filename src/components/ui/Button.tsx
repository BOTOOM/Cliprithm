import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "surface";
  size?: "sm" | "md";
}

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "font-medium tracking-wider transition-all duration-200 active:scale-[0.98] inline-flex items-center justify-center gap-2";

  const variants = {
    primary:
      "bg-gradient-to-br from-primary to-primary-dim text-on-primary-fixed font-bold rounded-md shadow-lg shadow-primary/20 hover:brightness-110",
    ghost:
      "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface rounded-md",
    surface:
      "bg-surface-container-high text-on-surface border border-outline-variant/10 rounded-md hover:bg-surface-container-highest",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2 text-sm",
  };

  const disabledClass = disabled ? "opacity-40 cursor-not-allowed" : "";

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${disabledClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
