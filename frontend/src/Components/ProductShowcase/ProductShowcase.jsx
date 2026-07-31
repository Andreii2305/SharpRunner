import styles from "./ProductShowcase.module.css";
import learningLoopImage from "../../assets/landing/learning-loop.png";

function ProductShowcase() {
  return (
    <section
      id="product-demo"
      className={styles.productSection}
      aria-labelledby="product-title"
    >
      <div className={styles.sectionInner}>
        <div className={styles.productCopy}>
          <span className={styles.eyebrow}>See the learning loop</span>
          <h2 id="product-title">Your Code Controls the Adventure</h2>
          <p>
            Students complete C# instructions, test their solutions, and
            immediately see how their code changes the character&apos;s actions
            inside the game.
          </p>
          <ul>
            <li>
              <span aria-hidden="true">✓</span>
              Read a focused lesson objective
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              Edit and run C# in the built-in editor
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              Receive clear success or correction feedback
            </li>
          </ul>
        </div>

        <div className={styles.productFrame}>
          <img
            src={learningLoopImage}
            width="1906"
            height="945"
            loading="lazy"
            className={styles.productImage}
            alt="SharpRunner lesson interface showing the game, C# code editor, objective, and run controls"
          />
        </div>
      </div>
    </section>
  );
}

export default ProductShowcase;
