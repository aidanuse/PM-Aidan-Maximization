import React, { useEffect, useRef } from "react";
import { X, ArrowRight, ClipboardList } from "lucide-react";
export function Button({
  children,
  kind = "secondary",
  className = "",
  ...props
}) {
  return (
    <button className={`btn btn-${kind} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Card({ children, className = "", ...props }) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Field({ label, children, hint, ...props }) {
  const labelId = React.useId();
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {children ? (
        React.cloneElement(children, { "aria-labelledby": labelId })
      ) : (
        <input aria-labelledby={labelId} {...props} />
      )}{" "}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Badge({ children, tone = "neutral", className = "" }) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}
export function Empty({ title, children, action, icon: Icon = ClipboardList }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Metric({ label, value, detail, icon: Icon, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-label">
        {label}
        {Icon && <Icon size={17} />}
      </div>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        );
        if (nodes?.length) {
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function SectionHead({ eyebrow, title, description, action }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function ArrowLink({ children, onClick }) {
  return (
    <button className="text-btn" onClick={onClick}>
      {children}
      <ArrowRight size={16} />
    </button>
  );
}
