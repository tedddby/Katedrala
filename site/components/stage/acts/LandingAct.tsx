import { Status } from "@/components/ui/Status";
import { Legend } from "../Legend";
import { StillFigure } from "../StillFigure";
import film from "../film.module.css";
import styles from "./acts.module.css";
import {
  baseName,
  FILE_LABEL,
  FILE_NONE,
  LANDING_LEDE,
  LANDING_TITLE,
  LEGEND_LABEL,
  PICKS_LABEL,
  READOUT_NONE,
  SCOPE_LINE,
  SHOW_DOWN,
  SHOW_LABEL,
  SHOW_UP,
  sourceLine,
} from "./copy";
import { actFacts } from "./facts";

/**
 * The landing's server markup: LandingAct is the act's block (its slot): the h2 and its sentence, the controls (the
 * direction as a radio group, every file in a select grouped by folder, four files to start from), the readout and the
 * drawing's legend. In the film the slot is pinned over the frame for the whole act (film.module.css): the block shows
 * while the landing is on screen, on wide frames as a column left of the structure, on tall ones as a sheet over the
 * frame's foot. In the still layout it is the article's last part, beside its own figure. Without script the controls
 * stay in the page (the narration and the legend still read); the drawing needs script to trace.
 *
 * LandingFrame renders nothing: the landing's words are its controls.
 */
export function LandingAct() {
  const { folders, picks, paths, repository, commit, sourceFiles } = actFacts();
  return (
    <div className={styles.landing}>
      <div className={styles.panel} data-ld-panel="" data-no-trace="" data-obstacle="">
        <div className={styles.landingHead}>
          <h2 className={styles.landingTitle}>{LANDING_TITLE}</h2>
          <button
            type="button"
            className={styles.legendToggle}
            data-ld-legend-toggle=""
            aria-expanded="false"
            aria-controls="kfilm-legend"
          >
            {LEGEND_LABEL}
            <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5 6 7.5l3-3" />
            </svg>
          </button>
        </div>
        <p className={styles.landingLede}>{LANDING_LEDE}</p>
        <div className={styles.controls}>
          <fieldset className={styles.show} data-ld-show="">
            <legend className={styles.controlLabel}>{SHOW_LABEL}</legend>
            <div className={styles.segments}>
              <label className={styles.segment}>
                <input type="radio" name="kfilm-show" value="down" defaultChecked />
                <span>{SHOW_DOWN}</span>
              </label>
              <label className={styles.segment}>
                <input type="radio" name="kfilm-show" value="up" />
                <span>{SHOW_UP}</span>
              </label>
            </div>
          </fieldset>
          <div className={styles.file}>
            <label className={styles.controlLabel} htmlFor="kfilm-file">
              {FILE_LABEL}
            </label>
            <div className={styles.selectWrap}>
              <select id="kfilm-file" className={styles.select} data-ld-file="" defaultValue="">
                <option value="">{FILE_NONE}</option>
                {folders.map((group) => (
                  <optgroup key={group.folder} label={group.folder === "" ? "/" : group.folder}>
                    {group.files.map((v) => (
                      <option key={v} value={v}>
                        {paths[v]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 4.5 6 7.5l3-3" />
              </svg>
            </div>
          </div>
          <div className={styles.picks} role="group" aria-labelledby="kfilm-picks">
            <span id="kfilm-picks" className={styles.controlLabel}>
              {PICKS_LABEL}
            </span>
            <div className={styles.pickList}>
              {picks.map((v) => {
                const path = paths[v]!;
                const name = baseName(path);
                return (
                  <button
                    key={v}
                    type="button"
                    className={styles.pick}
                    data-ld-pick=""
                    data-file={v}
                    aria-pressed="false"
                    aria-label={path}
                  >
                    <span className={styles.pickDir}>
                      {path.slice(0, path.length - name.length)}
                    </span>
                    <span className={styles.pickName}>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className={styles.readout} role="status" aria-atomic="true" data-ld-readout="">
            {READOUT_NONE}
          </p>
          <p className={styles.scope} data-ld-scope="">
            {SCOPE_LINE}
          </p>
        </div>
        <div id="kfilm-legend" className={styles.legend} data-ld-legend="">
          <Legend />
        </div>
      </div>
      <StillFigure act="trace" className={`${styles.landingFigure}`}>
        <p className={`${styles.figureBlock} ${film.titleblock}`}>
          <span>Katedrala&rsquo;s analysis of CodeVerse</span>
          <span>{sourceLine(repository, commit, sourceFiles)}</span>
          <Status status="available" label="Dependency graph, available today" />
        </p>
      </StillFigure>
    </div>
  );
}

export function LandingFrame() {
  return null;
}
