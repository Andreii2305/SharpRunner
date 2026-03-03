import styles from "./Button.module.css";

function Button({
  label,
  variant = "primary",
  size = "md",
  onClick,
  type = "button",
}) {
  const variantClass = styles[variant] ?? styles.primary;
  const sizeClass = styles[size] ?? styles.md;

  return (
    <button
      type={type}
      className={`${styles.button} ${variantClass} ${sizeClass}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default Button;
