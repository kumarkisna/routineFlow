export const aboutGuideSections = [
  {
    id: 'today',
    title: 'Today and routines',
    icon: 'home-outline' as const,
    steps: [
      'The Today tab is your starting point. Choose a routine card to open it, or use the add button to make a new routine.',
      'Use categories to group routines. Reorder, hide, rename, or remove categories and routines from Today.',
      'Open a routine to edit its steps, timers, details, skills, and spoken instructions.',
    ],
  },
  {
    id: 'create',
    title: 'Create a routine',
    icon: 'create-outline' as const,
    steps: [
      'Give the routine a clear name and add steps in the order you want to follow them.',
      'Set a duration for timed steps. Add step details or photos when they help explain what to do.',
      'Assign skills to a routine or individual steps. Hidden steps are skipped when the routine runs.',
      'Save your changes before leaving the editor.',
    ],
  },
  {
    id: 'run',
    title: 'Run and reflect',
    icon: 'play-circle-outline' as const,
    steps: [
      'Tap Start on a routine. Follow each step, use the timer controls, and move forward or back as needed.',
      'When a reflection template is set, it appears as the starting text after the run. Edit it for that run before saving.',
      'If skill ratings are enabled, rate the skills when prompted. Your ratings and reflection are saved with the run.',
    ],
  },
  {
    id: 'playlists',
    title: 'Use playlists',
    icon: 'list-outline' as const,
    steps: [
      'Open Playlists to combine routines into a sequence. Add routines, then arrange them in the order you want.',
      'Start a playlist to run its available routines in sequence. You can skip unavailable or hidden routines.',
      'Playlist skill ratings and completion reflections are collected with the playlist run.',
    ],
  },
  {
    id: 'skills',
    title: 'Skills and progress',
    icon: 'sparkles-outline' as const,
    steps: [
      'Use Skills to manage the skills you track and see where each skill is used.',
      'Ratings belong to the active person. Skill history and averages update as you save new ratings.',
      'Open History to review completed runs by date, routine, or playlist, and edit saved reflections.',
    ],
  },
  {
    id: 'schedule',
    title: 'Schedules',
    icon: 'calendar-outline' as const,
    steps: [
      'Open Schedule and choose New schedule to select a routine or playlist and its date and time.',
      'Set phone reminders and lead times when you want alerts. Tap Start on a schedule when you are ready to run it.',
      'All-profile backups include schedules. Importing a single-person backup does not restore schedules.',
    ],
  },
  {
    id: 'people',
    title: 'People and backups',
    icon: 'people-outline' as const,
    steps: [
      'Use the person control on Today to switch profiles or manage people. Each person has separate routines, schedules, ratings, and progress.',
      'Open the backup tools on Today to export or restore one person or all profiles. Imports merge data; review the confirmation before restoring.',
      'Appearance settings let you choose a theme. Themes are saved separately for each person.',
    ],
  },
] as const;

export type AboutGuideSection = (typeof aboutGuideSections)[number];
export type AboutGuideSectionId = AboutGuideSection['id'];

export type AboutGuidePrintWindow = {
  document: {
    open: () => void;
    write: (html: string) => void;
    close: () => void;
  };
  onafterprint: (() => void) | null;
  focus: () => void;
  print: () => void;
  close: () => void;
};

export function openAboutGuidePrintWindow(
  html: string,
  createWindow: () => AboutGuidePrintWindow | null,
): void {
  const printWindow = createWindow();
  if (!printWindow) throw new Error('Allow pop-ups in your browser to print the instructions.');
  printWindow.onafterprint = () => printWindow.close();
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function buildAboutGuideHtml(appName: string, copyright: string): string {
  if (!appName.trim() || !copyright.trim()) {
    throw new Error('App name and copyright details are required to print the guide.');
  }

  const sections = aboutGuideSections.map(section => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <ol>${section.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    </section>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(appName)} — How to use the app</title>
  <style>
    * { box-sizing: border-box; }
    body { max-width: 780px; margin: 0 auto; padding: 34px; color: #17202e; font: 15px/1.6 Arial, sans-serif; }
    h1 { margin: 0; font-size: 29px; line-height: 1.2; }
    .copyright { margin: 9px 0 28px; color: #526071; font-size: 12px; }
    section { margin: 0 0 24px; break-inside: avoid; }
    h2 { margin: 0 0 8px; font-size: 19px; }
    ol { margin: 0; padding-left: 24px; }
    li { margin: 0 0 7px; padding-left: 3px; }
    @page { margin: 18mm; }
    @media print {
      body { max-width: none; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(appName)} — How to use the app</h1>
  <p class="copyright">${escapeHtml(copyright)}</p>
  ${sections}
</body>
</html>`;
}
