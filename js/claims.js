// Claim definitions for Reflex Lab (spec v2). Pure data, no DOM.
// Convention: condition A is the baseline, B is the manipulation.
// claim.faster says which condition the CLAIM says is faster: 'A' | 'B' | 'none'.

export const APP_VERSION = '2.0.0';

export const TRIAL_OPTIONS = [6, 10, 14]; // even numbers so ABBA halves are equal
export const DEFAULT_TRIALS = 10;
export const WARMUP_TRIALS = 5;
export const PRACTICE_TRIALS = 30;
export const MAX_RERUNS = 3; // extra attempts per slot
export const FAST_MS = 100; // below = suspected anticipation
export const SLOW_MS = 1500; // above = slow (kept)
export const MISS_MS = 2500; // no response window
export const GONOGO_WINDOW_MS = 900;
export const GO_STAR = '★';
export const NOGO_SHAPES = ['■', '◆', '▲'];

export const DV = 'Browser-estimated reaction time (ms)';

export const CONTROL_OPTIONS = [
  { id: 'device', label: 'Same device and screen' },
  { id: 'finger', label: 'Same finger / same way of responding' },
  { id: 'posture', label: 'Same posture (sitting or standing)' },
  { id: 'rested', label: 'Equally rested and focused' },
  { id: 'room', label: 'Same quiet room, same lighting' },
  { id: 'trials', label: 'Same number of trials in each condition' },
  { id: 'distance', label: 'Same distance from the screen' },
  { id: 'volume', label: 'Same headphone volume (sound claim)' },
];

export const SENTENCE_STARTERS = [
  'My results support / do not support the claim because ',
  'The difference between A and B was / was not big enough to be sure because ',
  'Something that might have affected my results was ',
  'To be more confident I would ',
];

export const CLAIMS = [
  {
    id: 'hand',
    title: 'Dominant hand is faster',
    claimText: 'People react faster with their dominant hand than with their non-dominant hand.',
    blurb: 'Dominant vs non-dominant hand.',
    iv: 'Which hand you respond with',
    faster: 'A',
    a: { label: 'Dominant hand', short: 'dominant hand', how: 'Respond with the hand you write with. Keep the other hand off the device.', stim: 'visual' },
    b: { label: 'Non-dominant hand', short: 'non-dominant hand', how: 'Respond with the hand you do NOT write with. Keep the other hand off the device.', stim: 'visual' },
    design: 'abba',
    fair: [
      'Did you use the same finger, device and posture for both hands?',
      'Did you do the dominant hand first AND last (ABBA) so tiredness cancels out?',
      'Was the waiting time before GO random in both conditions?',
    ],
  },
  {
    id: 'sound',
    title: 'Sound beats light',
    claimText: 'People react faster to a sound than to a light.',
    blurb: 'Light cue vs a beep (headphones).',
    iv: 'Whether the signal is a light or a sound',
    faster: 'B',
    audio: true,
    note: 'This compares these two device-mediated tasks (screen + speakers/headphones). Each device adds its own small delay.',
    a: { label: 'Light (screen cue)', short: 'light', how: 'Tap as soon as the screen changes to GO.', stim: 'visual' },
    b: { label: 'Sound (beep)', short: 'sound', how: 'The screen stays neutral. Tap as soon as you HEAR the beep. Headphones on.', stim: 'audio' },
    design: 'abba',
    fair: [
      'Was your headphone volume comfortable and the same for every sound trial?',
      'Do speakers or headphones add a tiny delay that the screen does not?',
      'Did you keep looking at the screen in both conditions?',
    ],
  },
  {
    id: 'distract',
    title: 'Distractions slow you down',
    claimText: 'Distractions slow down reaction time.',
    blurb: 'Calm screen vs drifting shapes.',
    iv: 'Whether drifting shapes are on screen',
    faster: 'A',
    a: { label: 'Calm', short: 'calm screen', how: 'Plain cue screen. Tap on GO.', stim: 'visual' },
    b: { label: 'Distraction', short: 'distraction', how: 'Soft shapes drift behind the cue. Ignore them and tap only on GO.', stim: 'visual', decoys: true },
    design: 'abba',
    fair: [
      'Were the cue, the wait times and the response the same in both conditions?',
      'Were you equally focused during the calm and the distraction blocks?',
      'Did the shapes get in the way of seeing the cue, or only of your attention?',
    ],
  },
  {
    id: 'multitask',
    title: 'Multitasking slows you down',
    claimText: 'Doing a second thinking task slows down reaction time.',
    blurb: 'Single task vs counting backwards by 3.',
    iv: 'Whether you count backwards silently while you wait',
    faster: 'A',
    a: { label: 'Single task', short: 'single task', how: 'Only watch for GO and tap.', stim: 'visual' },
    b: { label: 'Counting backwards', short: 'counting', how: 'Silently count backwards by 3 from the number shown, in your head. Still tap on GO. Do not say it out loud.', stim: 'visual', count: true },
    design: 'abba',
    fair: [
      'Did you count silently (not out loud) every time?',
      'Did you start the counting from the number shown each block?',
      'Did counting change how you tap, or only when you tap?',
    ],
  },
  {
    id: 'decide',
    title: 'Deciding takes time',
    claimText: 'Making a decision before reacting makes you slower.',
    blurb: 'Simple tap vs go / no-go.',
    iv: 'Whether you must decide if the shape is a target',
    faster: 'A',
    a: { label: 'Simple', short: 'simple reaction', how: 'Tap on GO.', stim: 'visual' },
    b: { label: 'Go / no-go', short: 'go / no-go', how: 'Tap ONLY for the filled star. Do NOT tap for squares, diamonds or triangles. You have under a second to decide.', stim: 'visual', gonogo: true },
    design: 'abba',
    fair: [
      'Did you tap every time you saw the star and hold back for the others?',
      'Did you also look at the mistakes (taps on non-targets, missed stars), not just the speed?',
      'Was the waiting time random in both conditions?',
    ],
  },
  {
    id: 'practice',
    title: 'Practice makes you faster',
    claimText: 'Practice makes reaction time faster.',
    blurb: 'Before vs after 30 practice trials.',
    iv: 'Whether you have done 30 practice trials first',
    faster: 'B',
    order: true,
    note: 'Before/after study: order, learning and fatigue effects cannot be separated from practice. Treat the result with care.',
    a: { label: 'Before practice', short: 'before practice', how: 'Normal reaction task. Tap on GO.', stim: 'visual' },
    b: { label: 'After practice', short: 'after practice', how: 'Same task again, after 30 practice trials. Tap on GO.', stim: 'visual' },
    design: 'beforeAfter',
    fair: [
      'Is it fair that you were more tired (or more warmed up) in the "after" block?',
      'Would a friend who did the blocks in the opposite order get the same result?',
      'Did anything else change between the before and after blocks?',
    ],
  },
];

// Teacher-enabled custom claims: approved manipulations only.
export const CUSTOM_MANIPULATIONS = [
  { id: 'posture', iv: 'Sitting vs standing', a: 'Sitting', b: 'Standing', how: 'sit' },
  { id: 'glasses', iv: 'Glasses / contacts on vs off', a: 'Glasses/contacts on', b: 'Glasses/contacts off', how: 'glasses' },
  { id: 'upright', iv: 'Upright vs slouched posture', a: 'Sitting upright', b: 'Slouched', how: 'upright' },
];

export function customClaim(manipId, claimText, faster) {
  const m = CUSTOM_MANIPULATIONS.find((x) => x.id === manipId) || CUSTOM_MANIPULATIONS[0];
  return {
    id: 'custom',
    title: 'Custom: ' + m.iv,
    claimText: claimText || 'My own claim about ' + m.iv.toLowerCase(),
    blurb: m.iv,
    iv: m.iv,
    faster: faster || 'A',
    custom: true,
    a: { label: m.a, short: m.a.toLowerCase(), how: 'Set yourself up: ' + m.a + '. Then tap on GO.', stim: 'visual' },
    b: { label: m.b, short: m.b.toLowerCase(), how: 'Set yourself up: ' + m.b + '. Then tap on GO.', stim: 'visual' },
    design: 'abba',
    fair: [
      'Did you change only ' + m.iv.toLowerCase() + ' and keep everything else the same?',
      'Did you stay in the same position for the whole block?',
      'Was your device and tapping method the same in both conditions?',
    ],
  };
}

export function getClaim(id) {
  return CLAIMS.find((c) => c.id === id) || null;
}

export function condOf(claim, cond) {
  return cond === 'B' ? claim.b : claim.a;
}

export function stimTypeOf(claim, cond) {
  return condOf(claim, cond).stim;
}
