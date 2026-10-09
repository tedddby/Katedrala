import { LINKS } from "@/lib/site";
import styles from "./cinematic.module.css";

/**
 * The prototype route's top bar: the wordmark and the two ways out. Clear over the film's drawing, it takes its
 * own ground (and a rule) once the film has scrolled away. On the main page the site's navigation does the same
 * (see film-global.css).
 */
export function LabNav() {
  return (
    <header className={styles.nav}>
      <a href="#top" className={styles.brand} aria-label="Katedrala, back to top">
        <svg aria-hidden="true" viewBox="0 0 22 22" className={styles.brandMark}>
          <path
            d="M2 4.5 11 12l9-7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="11" cy="12" r="2.4" fill="var(--color-load, #3ea6ff)" />
          <path
            d="M11 14.6 7.6 19.4h6.8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.brandName}>KATEDRALA</span>
      </a>
      <nav aria-label="Primary" className={styles.navLinks}>
        <a href={LINKS.repository} rel="noopener" className={styles.navLink}>
          GitHub
        </a>
        <a
          href={LINKS.readme}
          rel="noopener"
          className={`${styles.button} ${styles.primary} ${styles.navButton}`}
        >
          Get started<span className={styles.srOnly}> on GitHub</span>
        </a>
      </nav>
    </header>
  );
}
