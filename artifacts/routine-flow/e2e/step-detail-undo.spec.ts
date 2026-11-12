import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import type { Routine } from '../types/routines';

const baseURL = process.env.RESTORE_TEST_BASE_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}` : undefined);

test.use({
  baseURL,
  viewport: { width: 400, height: 720 },
  launchOptions: {
    ...(process.env.CHROMIUM_PATH || existsSync('/repl/tools/bin/chromium')
      ? { executablePath: process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium' }
      : {}),
  },
});

test('undo restores a removed formatted note before saving and reopening the routine', async ({ page }) => {
  if (!baseURL) throw new Error('Set RESTORE_TEST_BASE_URL to the running Expo web preview URL.');

  const attachment = {
    id: 'undo-guide-file',
    name: 'undo-checklist.txt',
    uri: 'local://undo-checklist.txt',
    mimeType: 'text/plain',
    kind: 'document' as const,
    contentBase64: 'Y2hlY2tsaXN0',
  };
  const routine: Routine = {
    id: 'undo-note-routine',
    title: 'Undo note routine',
    subtitle: 'Keep the extra note intact',
    icon: 'sunny-outline',
    tone: 'coral',
    createdAt: '2026-10-14T08:00:00.000Z',
    steps: [{
      id: 'check-care-plan',
      title: 'Check the care plan',
      description: 'Read the main instructions.',
      additionalDetails: ['Restore the undo guide.'],
      detailHtml: [
        '<p>Read the main instructions.</p>',
        '<p><strong>Restore</strong> the <a href="https://example.com/undo-guide">undo guide</a>.</p>',
      ],
      detailSpeech: [true, false],
      detailAttachments: [[], [attachment]],
      durationSeconds: 60,
    }],
  };

  await page.addInitScript(seedRoutine => {
    localStorage.setItem('@routine-flow/routines', JSON.stringify([seedRoutine]));
    localStorage.setItem('@routine-flow/progress', '{}');
    localStorage.setItem('@routine-flow/skills', '[]');
    localStorage.setItem('@routine-flow/playlists', '[]');
  }, routine);

  await page.goto('/routine/undo-note-routine');
  await page.getByTestId('edit-routine').click();
  await expect(page.getByText('Edit routine', { exact: true })).toBeVisible();
  await page.getByLabel('Edit Check the care plan').click();

  await expect(page.getByTestId('additional-step-detail-0')).toHaveValue('Restore the undo guide.');
  await expect(page.getByTestId('additional-detail-files-0')).toContainText('undo-checklist.txt');
  await expect(page.getByRole('switch', { name: 'Speak additional detail 1 during the routine' })).not.toBeChecked();

  await page.getByTestId('remove-step-detail-0').click();
  await expect(page.getByTestId('additional-step-detail-0')).toHaveCount(0);
  await expect(page.getByTestId('additional-detail-files-0')).toHaveCount(0);
  await page.getByTestId('undo-remove-step-detail').click();

  await expect(page.getByTestId('additional-step-detail-0')).toHaveValue('Restore the undo guide.');
  await expect(page.getByTestId('additional-detail-files-0')).toContainText('undo-checklist.txt');
  await expect(page.getByRole('switch', { name: 'Speak additional detail 1 during the routine' })).not.toBeChecked();
  await page.getByLabel('Expand rich text editor for Additional detail 1').click();
  await expect(page.getByTestId('rich-detail-web-input')).toHaveValue('Restore the undo guide.');
  await page.getByTestId('rich-detail-close-keep').click();
  await page.getByLabel('Update step').click();
  await page.getByLabel('Save routine').click();

  await expect(page.getByRole('link', { name: 'undo guide' })).toHaveAttribute(
    'href',
    'https://example.com/undo-guide',
  );
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('@routine-flow/routines') ?? '[]') as Routine[]);
  const savedStep = saved.find(item => item.id === 'undo-note-routine')!.steps[0];
  expect(savedStep).toMatchObject({
    additionalDetails: ['Restore the undo guide.'],
    detailHtml: [
      '<p>Read the main instructions.</p>',
      '<p><strong>Restore</strong> the <a href="https://example.com/undo-guide">undo guide</a>.</p>',
    ],
    detailSpeech: [true, false],
    detailAttachments: [[], [attachment]],
  });

  await page.getByTestId('edit-routine').click();
  await expect(page.getByText('Edit routine', { exact: true })).toBeVisible();
  await page.getByLabel('Edit Check the care plan').click();
  await expect(page.getByTestId('additional-step-detail-0')).toHaveValue('Restore the undo guide.');
  await expect(page.getByTestId('additional-detail-files-0')).toContainText('undo-checklist.txt');
  await expect(page.getByRole('switch', { name: 'Speak additional detail 1 during the routine' })).not.toBeChecked();
});
