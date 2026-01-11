import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import styles from "./GamePage.module.css";
import Button from "../../Components/Button/Button.jsx";
import { useNavigate } from "react-router-dom";
import Game from "./Game.jsx";

const LevelOne = () => {
  const navigate = useNavigate();

  const [code, setCode] = useState(
    "using System;\n\nnamespace SharpRunner {\n  class Program {\n    static void Main(string[] args) {\n      // code here\n    }\n  }\n}"
  );

  const exitButton = () => {
    navigate("/dashboard");
  };

  return (
    <div className={styles.gameContainer}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>The Castle of Syntax</h1>
          <span>Level 1 - The Awakening</span>
        </div>
        <Button label="Exit" variant="outline" size="sm" onClick={exitButton} />
      </header>

      <main className={styles.mainLayout}>
        {/* UPPER ROW (ORANGE): Phaser (1) + Editor (2) */}
        <div className={styles.upperRow}>
          <div id="phaser-canvas-root" className={styles.phaserCanvasRoot}>
            <Game />
          </div>

          <div className={styles.editorPanel}>
            <div className={styles.editorHeader}>
              <span>
                <b>C#</b>
              </span>
              <Button label="Submit" variant="primary" size="sm" />
            </div>
            <div style={{ flexGrow: 1 }}>
              <Editor
                height="100%"
                theme="light"
                defaultLanguage="csharp"
                value={code}
                onChange={(val) => setCode(val)}
                options={{ minimap: { enabled: false }, fontSize: 14 }}
              />
            </div>
            <div className={styles.editorFooter}>
              <Button label="Run" variant="outline" size="sm" />
            </div>
          </div>
        </div>

        {/* LOWER ROW (GREEN): Goals (1) + Lessons (2) */}
        <div className={styles.lowerRow}>
          <section className={styles.card}>
            <h3>Goal</h3>
            <p>
              Open the gate by declaring and initializing the correct variables.
            </p>
            <h3>Instruction</h3>
            <ul>
              <li>The ancient gate before you is sealed by code.</li>
              <li>
                To unlock it, declare a variable named <b>key</b>.
              </li>
            </ul>
          </section>

          <section className={styles.card}>
            <h3>Declaring Variables</h3>
            <p>
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Non
              molestiae repellat rem, quibusdam sed consequuntur odio atque
              blanditiis ad assumenda fugit voluptas impedit labore deserunt
              adipisci nobis. Repellat, sint asperiores.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default LevelOne;
