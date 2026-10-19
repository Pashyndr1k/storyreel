// The craft rules of the graphic novel workflow: what Stage 4 is told when it
// breaks a scene into shots (one shot = one comic screen), how the planner
// composes panels, and the house look of the images when the project has no
// image style of its own. No imports: prompts.js reads these too.

export const NOVEL_SHOT_NOTE = `GRAPHIC NOVEL FORMAT — this project is a vertical comic, not a video. Every shot you write becomes ONE 9:16 comic screen of two or three panels read top to bottom. Write each shot as a short sequence of two or three visual beats (an action and its result, a line and the reaction, a detail and the face that sees it) inside one place and moment. Keep a shot's dialogue to what fits three speech balloons (about 45 words in total). "duration_sec" only paces the reading: 4–8.`;

export const COMPOSITION_RULES = `PANEL COMPOSITION — the craft of the comic page:
- Reading order is a Z-path: left to right, top to bottom. Balloons are read in that order, so the character who speaks FIRST in a panel stands on the LEFT (or higher), the one who answers on the right.
- One panel = one moment. Never repeat the same framing in two adjacent panels: alternate distance (wide → medium → close-up → insert) and angle (eye level, low, high, over-the-shoulder).
- The first panel of a scene establishes the place (wide or medium-wide) unless the scene opens on a hook close-up; re-establish after a change of place.
- 180° rule: characters keep their sides of the frame from panel to panel within a scene.
- The big panel of a layout carries the most important beat; the LAST panel of every screen is the hook that makes the reader scroll on (a question, a reveal, a face reacting).
- Close-ups for emotion and reactions, wide shots for geography and action, inserts (hands, objects, a phone screen) for clues.
- Fit the composition to the panel's box: a WIDE panel takes a horizontal composition (figures spread across, landscape depth); a TALL panel takes a vertical one (one figure, or two stacked in depth).
- Depth and direction: foreground / midground / background layers; diagonals for action and conflict, horizontals for calm, verticals for power.
- Where a panel carries dialogue, keep its UPPER THIRD clear (sky, wall, ceiling, soft background) for the balloons; faces and key action sit below it. Silent panels may use the whole frame.
- Silent panels are allowed and strong: a look, a hand, a door — let the image breathe between lines.`;

export const DEFAULT_NOVEL_STYLE = 'Graphic novel illustration: confident clean ink line art with varied line weight, cel shading with flat colour areas and soft gradients, cinematic lighting with strong shadows, expressive faces and hands, rich but controlled palette, crisp details — a modern webtoon / graphic novel panel.';

// Appended to every panel image prompt: the app letters the page itself.
export const NO_LETTERING_RULE = 'The image is ONE comic panel without any lettering: NO text, letters, words, numbers, speech balloons, thought bubbles, captions, sound-effect lettering, logos, panel borders, frames or gutters inside the image.';
