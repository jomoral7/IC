import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

/** Presentation only: native props, handlers and disabled state belong to the caller. */
export function Button({ variant = "primary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "icon";
}) {
  return <button {...props} className={clsx("ic-button", `ic-button--${variant}`, `ic-button--${size}`, className)} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("ic-input", className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx("ic-input", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx("ic-input", className)} />;
}

export function Field({ label, htmlFor, help, children }: {
  label: string; htmlFor: string; help?: string; children: ReactNode;
}) {
  return <div className="ic-field"><label htmlFor={htmlFor}>{label}</label>{children}{help && <small>{help}</small>}</div>;
}

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span {...props} className={clsx("ic-badge", `ic-badge--${tone}`, className)} />;
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={clsx("ic-panel", className)} />;
}
