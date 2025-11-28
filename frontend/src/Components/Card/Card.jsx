import styles from "./Card.module.css";

function Card({ title, description, imageSrc, bgColor, altText }) {
  return (
    <div className={styles.Cards}>
      <div className={styles.featureTop} style={{ backgroundColor: bgColor }}>
        <img src={imageSrc} alt={altText} className={styles.cardImage} />
        <div className={styles.cardDescription}>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
}

export default Card;
