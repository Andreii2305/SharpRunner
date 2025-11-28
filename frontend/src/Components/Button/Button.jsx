import styles from "./Button.module.css";

function Button({ label, variant = "primary", onClick, type = "button" }) {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[variant]}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default Button;
