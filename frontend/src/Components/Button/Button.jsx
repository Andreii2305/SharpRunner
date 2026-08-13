import { forwardRef } from "react";
import styles from "./Button.module.css";

const Button = forwardRef(function Button({
  label,
  variant = "primary",
  size = "md",
  onClick,
  type = "button",
  disabled = false,
  ...buttonProps
}, ref) {
  const variantClass = styles[variant] ?? styles.primary;
  const sizeClass = styles[size] ?? styles.md;

  return (
    <button
      ref={ref}
      type={type}
      className={`${styles.button} ${variantClass} ${sizeClass}`}
      onClick={onClick}
      disabled={disabled}
      {...buttonProps}
    >
      {label}
    </button>
  );
});

export default Button;
