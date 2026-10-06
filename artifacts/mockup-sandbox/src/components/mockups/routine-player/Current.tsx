import './_group.css';

function SpeakerIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" fill="currentColor" />
      <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Current() {
  return (
    <main className="rp-stage">
      <div className="rp-safe-top" />
      <header className="rp-header">
        <button className="rp-icon-button" type="button" aria-label="Close timer">×</button>
        <div className="rp-header-copy">
          <div className="rp-header-label">Playlist · 2 of 2</div>
          <div className="rp-header-title">After noon</div>
        </div>
        <button className="rp-icon-button" type="button" aria-label="Mute step voice">
          <SpeakerIcon />
        </button>
      </header>
      <div className="rp-current-playlist">Test</div>

      <section className="rp-timer-card" aria-label="Current step timer">
        <div className="rp-timer-ring">
          <div className="rp-timer-value">00:04:16</div>
          <div className="rp-timer-status">Paused</div>
        </div>
        <div className="rp-active-step">1</div>
        <div className="rp-active-meta">Step 1 of 1 · 5m 00s</div>
      </section>

      <div className="rp-content">
        <div className="rp-progress" role="progressbar" aria-label="Routine progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={1}>
          <div className="rp-progress-fill" />
        </div>
        <div className="rp-controls">
          <button className="rp-skip" type="button" aria-label="Skip current step">▶|</button>
          <button className="rp-start" type="button" aria-label="Start timer"><span>▶</span> Start</button>
        </div>
        <section className="rp-reminder-card" aria-label="Reminders">
          <div className="rp-reminder-heading">
            <span className="rp-bell"><BellIcon /></span>
            <div>
              <div className="rp-reminder-title">Reminders</div>
              <div className="rp-reminder-description">Get a reminder even when your phone is locked.</div>
            </div>
          </div>
          <div className="rp-reminder-row"><span>When a step finishes</span><span className="rp-switch" aria-hidden="true" /></div>
          <div className="rp-reminder-row"><span>When the routine finishes</span><span className="rp-switch" aria-hidden="true" /></div>
        </section>
        <div className="rp-sequence-heading">
          <span>SEQUENCE</span>
          <span className="rp-sequence-total">5m 00s total</span>
        </div>
        <div className="rp-step-row">
          <span className="rp-step-number">1</span>
          <div><div className="rp-step-title">1</div><div className="rp-step-duration">5m 00s</div></div>
        </div>
      </div>
    </main>
  );
}
