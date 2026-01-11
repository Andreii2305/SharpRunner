import styles from "./Button.module.css";

function Button({
  label,
  variant = "primary",
  onClick,
  type = "button",
  size = "md",
}) {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[variant]} ${styles[size]}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default Button;
