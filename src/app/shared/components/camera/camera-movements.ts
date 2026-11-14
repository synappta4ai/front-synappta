// Catálogo de movimientos de cámara generado desde `camera movement.md`
// (copia en src/assets/camera_movements.md). No editar a mano.

export interface CameraMovement {
  id: string;
  name: string;
  family: string;
  /** Diagrama esquemático de la tarjeta. */
  diagram: string;
  /** Instrucción completa que se inyecta en el prompt. */
  prompt: string;
}

export const CAMERA_MOVEMENTS: readonly CameraMovement[] = [
  {
    id: "static-shot",
    name: "Static shot",
    family: "PAN / TILT",
    diagram: "static",
    prompt: "locked-off static shot. Movement: hold one fixed camera position for the full clip. Speed: still and steady. Framing: keep the same angle, height, lens distance and composition. End: finish with the same framing and camera position.",
  },
  {
    id: "pan-right",
    name: "Pan right",
    family: "PAN / TILT",
    diagram: "pan-right",
    prompt: "pan right. Movement: rotate the camera horizontally from left to right from one fixed point. Speed: smooth constant rotation. Framing: keep the horizon level while new space enters from the right side of the frame. End: settle on a clear final composition.",
  },
  {
    id: "pan-left",
    name: "Pan left",
    family: "PAN / TILT",
    diagram: "pan-left",
    prompt: "pan left. Movement: rotate the camera horizontally from right to left from one fixed point. Speed: smooth constant rotation. Framing: keep the horizon level while new space enters from the left side of the frame. End: settle on a clear final composition.",
  },
  {
    id: "whip-pan-right",
    name: "Whip pan right",
    family: "PAN / TILT",
    diagram: "pan-right",
    prompt: "whip pan right. Movement: rotate rapidly from the starting direction toward a new target on the right. Speed: fast snap with brief motion blur during the rotation. Framing: begin on one readable composition and land on a second readable target. End: settle into a sharp final frame.",
  },
  {
    id: "whip-pan-left",
    name: "Whip pan left",
    family: "PAN / TILT",
    diagram: "pan-left",
    prompt: "whip pan left. Movement: rotate rapidly from the starting direction toward a new target on the left. Speed: fast snap with brief motion blur during the rotation. Framing: begin on one readable composition and land on a second readable target. End: settle into a sharp final frame.",
  },
  {
    id: "tilt-up",
    name: "Tilt up",
    family: "PAN / TILT",
    diagram: "tilt-up",
    prompt: "tilt up. Movement: rotate the camera upward from one fixed point. Speed: smooth constant tilt. Framing: keep the vertical subject or architecture centered as the frame travels upward. End: land on the upper target.",
  },
  {
    id: "tilt-down",
    name: "Tilt down",
    family: "PAN / TILT",
    diagram: "tilt-down",
    prompt: "tilt down. Movement: rotate the camera downward from one fixed point. Speed: smooth constant tilt. Framing: keep the vertical subject or architecture centered as the frame travels downward. End: land on the lower target.",
  },
  {
    id: "slow-zoom-in",
    name: "Slow zoom in",
    family: "ZOOM / LENS",
    diagram: "zoom-in",
    prompt: "slow zoom in. Movement: slowly increase lens focal length toward a tighter frame. Speed: gradual and even. Framing: keep the main visual target readable as it becomes larger in frame. End: finish on a stable tighter composition.",
  },
  {
    id: "slow-zoom-out",
    name: "Slow zoom out",
    family: "ZOOM / LENS",
    diagram: "zoom-out",
    prompt: "slow zoom out. Movement: slowly decrease lens focal length toward a wider frame. Speed: gradual and even. Framing: keep the main visual target readable as more surrounding space appears. End: finish on a stable wider composition.",
  },
  {
    id: "fast-zoom-in",
    name: "Fast zoom in",
    family: "ZOOM / LENS",
    diagram: "zoom-in",
    prompt: "fast zoom in. Movement: quickly increase lens focal length toward the main visual target. Speed: quick decisive zoom. Framing: keep the target centered or clearly readable during the scale change. End: finish on a stable tighter composition.",
  },
  {
    id: "fast-zoom-out",
    name: "Fast zoom out",
    family: "ZOOM / LENS",
    diagram: "zoom-out",
    prompt: "fast zoom out. Movement: quickly decrease lens focal length away from the main visual target. Speed: quick decisive zoom. Framing: keep the target readable as the surrounding space appears. End: finish on a stable wider composition.",
  },
  {
    id: "crash-zoom-in",
    name: "Crash zoom in",
    family: "ZOOM / LENS",
    diagram: "zoom-in",
    prompt: "crash zoom in. Movement: snap the lens rapidly toward the main visual target. Speed: very fast and punchy. Framing: keep the target readable through the sudden scale change. End: land on a bold tighter composition.",
  },
  {
    id: "crash-zoom-out",
    name: "Crash zoom out",
    family: "ZOOM / LENS",
    diagram: "zoom-out",
    prompt: "crash zoom out. Movement: snap the lens rapidly away from the main visual target. Speed: very fast and punchy. Framing: keep the target readable as the surrounding space appears. End: land on a bold wider composition.",
  },
  {
    id: "dolly-in",
    name: "Dolly in",
    family: "DOLLY / TRACK",
    diagram: "dolly-in",
    prompt: "dolly in. Movement: move the camera physically forward in a straight line toward the main subject. Speed: smooth controlled push. Framing: keep camera height, lens direction and subject position consistent while distance closes. End: finish in a tighter composition.",
  },
  {
    id: "dolly-out",
    name: "Dolly out",
    family: "DOLLY / TRACK",
    diagram: "dolly-out",
    prompt: "dolly out. Movement: move the camera physically backward in a straight line away from the main subject. Speed: smooth controlled retreat. Framing: keep lens direction and camera height consistent while more environment enters frame. End: finish in a wider composition.",
  },
  {
    id: "tracking-shot",
    name: "Tracking shot",
    family: "DOLLY / TRACK",
    diagram: "dolly-in",
    prompt: "tracking shot. Movement: move through the scene with the main subject. Speed: match the subject's pace. Framing: keep the subject consistently readable while the environment moves around them. End: maintain a clear moving composition.",
  },
  {
    id: "follow-shot-over-the-shoulder",
    name: "Follow shot / over-the-shoulder",
    family: "DOLLY / TRACK",
    diagram: "tracking",
    prompt: "follow shot from behind. Movement: move behind the subject along their route at shoulder height. Speed: match the subject's pace. Framing: keep the back, shoulder or head as the foreground guide while the route ahead stays readable. End: continue following with the subject leading the frame.",
  },
  {
    id: "reverse-tracking-walk-and-talk",
    name: "Reverse tracking / walk-and-talk",
    family: "DOLLY / TRACK",
    diagram: "dolly-in",
    prompt: "reverse tracking shot. Movement: move backward in front of the walking subject. Speed: match the subject's forward pace. Framing: keep front-facing face and body framing stable as the background moves behind them. End: hold a clear front-facing moving composition.",
  },
  {
    id: "side-tracking",
    name: "Side tracking",
    family: "DOLLY / TRACK",
    diagram: "dolly-in",
    prompt: "side tracking shot. Movement: move parallel beside the subject along their direction of travel. Speed: match the subject's motion. Framing: keep the subject in side profile or three-quarter view at a stable distance. End: continue the parallel movement with clear horizontal motion.",
  },
  {
    id: "low-tracking",
    name: "Low tracking",
    family: "DOLLY / TRACK",
    diagram: "dolly-in",
    prompt: "low tracking shot. Movement: move at ground or below-waist height alongside the subject's movement path. Speed: match the subject, footsteps or wheels. Framing: keep the low detail readable while the ground plane moves through frame. End: finish with the low perspective clearly maintained.",
  },
  {
    id: "vehicle-tracking",
    name: "Vehicle tracking",
    family: "DOLLY / TRACK",
    diagram: "dolly-in",
    prompt: "vehicle tracking shot. Movement: move with the vehicle along its route. Speed: match the vehicle's pace. Framing: keep the vehicle stable in frame while the road or environment moves past. End: maintain a clear moving vehicle composition.",
  },
  {
    id: "chase-shot",
    name: "Chase shot",
    family: "DOLLY / TRACK",
    diagram: "tracking",
    prompt: "chase shot. Movement: follow a moving subject quickly along the action route. Speed: fast, reactive and physically close. Framing: keep the subject visible while allowing energetic reframing. End: stay connected to the subject in motion.",
  },
  {
    id: "truck-right",
    name: "Truck right",
    family: "PHYSICAL MOVES",
    diagram: "right",
    prompt: "truck right. Movement: move the camera physically to the right on a straight horizontal path. Speed: smooth constant lateral travel. Framing: keep the lens facing the same direction while the scene slides across frame. End: finish on a clean lateral composition.",
  },
  {
    id: "truck-left",
    name: "Truck left",
    family: "PHYSICAL MOVES",
    diagram: "left",
    prompt: "truck left. Movement: move the camera physically to the left on a straight horizontal path. Speed: smooth constant lateral travel. Framing: keep the lens facing the same direction while the scene slides across frame. End: finish on a clean lateral composition.",
  },
  {
    id: "pedestal-up",
    name: "Pedestal up",
    family: "PHYSICAL MOVES",
    diagram: "up",
    prompt: "pedestal up. Movement: move the entire camera vertically upward in a straight line. Speed: smooth constant lift. Framing: keep the lens level and pointed in the same direction during the vertical move. End: finish with the higher framing clearly readable.",
  },
  {
    id: "pedestal-down",
    name: "Pedestal down",
    family: "PHYSICAL MOVES",
    diagram: "down",
    prompt: "pedestal down. Movement: move the entire camera vertically downward in a straight line. Speed: smooth constant descent. Framing: keep the lens level and pointed in the same direction during the vertical move. End: finish with the lower framing clearly readable.",
  },
  {
    id: "slider-right",
    name: "Slider right",
    family: "PHYSICAL MOVES",
    diagram: "right",
    prompt: "slider right. Movement: slide the camera a small distance to the right. Speed: slow controlled constant motion. Framing: keep foreground, subject and background layers readable as parallax shifts. End: finish on a refined composition with the new right-side angle visible.",
  },
  {
    id: "slider-left",
    name: "Slider left",
    family: "PHYSICAL MOVES",
    diagram: "left",
    prompt: "slider left. Movement: slide the camera a small distance to the left. Speed: slow controlled constant motion. Framing: keep foreground, subject and background layers readable as parallax shifts. End: finish on a refined composition with the new left-side angle visible.",
  },
  {
    id: "push-past-pass-by-shot",
    name: "Push past / pass-by shot",
    family: "PHYSICAL MOVES",
    diagram: "tracking",
    prompt: "push past. Movement: move forward past a visible foreground object, edge or opening. Speed: smooth forward glide. Framing: let the foreground pass close to the lens while the space beyond becomes clearer. End: arrive inside or beyond the foreground layer.",
  },
  {
    id: "arc-right",
    name: "Arc right",
    family: "PHYSICAL MOVES",
    diagram: "orbit",
    prompt: "arc right. Movement: move on a shallow curved path around the main subject toward the right side. Speed: smooth measured curve. Framing: keep distance, height and subject readability consistent while the angle changes. End: finish from a new right-side angle.",
  },
  {
    id: "arc-left",
    name: "Arc left",
    family: "PHYSICAL MOVES",
    diagram: "orbit",
    prompt: "arc left. Movement: move on a shallow curved path around the main subject toward the left side. Speed: smooth measured curve. Framing: keep distance, height and subject readability consistent while the angle changes. End: finish from a new left-side angle.",
  },
  {
    id: "orbit-clockwise",
    name: "Orbit clockwise",
    family: "PHYSICAL MOVES",
    diagram: "orbit",
    prompt: "clockwise orbit. Movement: circle clockwise around the main subject at a consistent radius. Speed: smooth controlled orbit. Framing: keep the subject centered while the background rotates around them. End: complete the intended arc or full circle with stable framing.",
  },
  {
    id: "orbit-counterclockwise",
    name: "Orbit counterclockwise",
    family: "PHYSICAL MOVES",
    diagram: "orbit",
    prompt: "counterclockwise orbit. Movement: circle counterclockwise around the main subject at a consistent radius. Speed: smooth controlled orbit. Framing: keep the subject centered while the background rotates around them. End: complete the intended arc or full circle with stable framing.",
  },
  {
    id: "handheld-shot",
    name: "Handheld shot",
    family: "HUMAN CAMERA",
    diagram: "handheld",
    prompt: "handheld shot. Movement: hold the camera at human operator height with natural body movement. Speed: responsive and organic. Framing: keep the subject readable while the frame has subtle sway and micro-adjustments. End: finish with a natural handheld composition.",
  },
  {
    id: "body-mounted-camera-snorricam",
    name: "Body-mounted camera / Snorricam",
    family: "HUMAN CAMERA",
    diagram: "handheld",
    prompt: "body-mounted Snorricam. Movement: keep the camera fixed relative to the subject's torso or face while the subject moves. Speed: match the subject's body motion. Framing: keep the subject close, centered and facing the camera as the background moves around them. End: finish with the subject still locked in frame.",
  },
  {
    id: "crane-up",
    name: "Crane up",
    family: "DRONE / CRANE",
    diagram: "crane",
    prompt: "crane up. Movement: travel smoothly upward through open space. Speed: slow controlled vertical lift. Framing: keep the subject or location readable as the camera rises. End: finish with the higher scale clearly visible.",
  },
  {
    id: "crane-down",
    name: "Crane down",
    family: "DRONE / CRANE",
    diagram: "crane",
    prompt: "crane down. Movement: travel smoothly downward through open space. Speed: slow controlled vertical descent. Framing: keep the subject or location readable as the camera descends. End: finish with the lower subject or destination clearly visible.",
  },
  {
    id: "drone-push-in",
    name: "Drone push in",
    family: "DRONE / CRANE",
    diagram: "crane",
    prompt: "drone push in. Movement: fly smoothly forward through open space toward the subject or destination. Speed: controlled aerial glide. Framing: keep the route and destination readable as the camera approaches. End: arrive at a closer aerial composition.",
  },
  {
    id: "drone-pull-back",
    name: "Drone pull back",
    family: "DRONE / CRANE",
    diagram: "crane",
    prompt: "drone pull back. Movement: fly smoothly backward away from the subject or destination. Speed: controlled aerial retreat. Framing: keep the subject readable as more landscape appears. End: finish on a wider aerial composition.",
  },
  {
    id: "helicopter-shot",
    name: "Helicopter shot",
    family: "DRONE / CRANE",
    diagram: "tracking",
    prompt: "helicopter-style aerial shot. Movement: move from high altitude along a broad gradual flight path. Speed: steady controlled aerial motion. Framing: keep the landscape or distant moving subject readable at wide scale. End: finish on a stable high-altitude composition.",
  },
  {
    id: "first-person-view",
    name: "First-person view",
    family: "SPECIALS",
    diagram: "tracking",
    prompt: "first-person view. Movement: move forward at human eye height from the character's perspective. Speed: natural walking or reaching pace. Framing: use visible hands, arms or body edges as the viewer's physical reference. End: arrive at the next point of action from the same point of view.",
  },
  {
    id: "tilt-shift",
    name: "Tilt-shift",
    family: "SPECIALS",
    diagram: "tilt-up",
    prompt: "tilt-shift miniature view. Movement: hold or glide from a high angled view over the scene. Speed: small precise movement. Framing: keep a narrow band of sharp focus across the key subject area with soft blur above and below. End: finish with the miniature-scale view intact.",
  },
  {
    id: "infinite-zoom",
    name: "Infinite zoom",
    family: "SPECIALS",
    diagram: "zoom-in",
    prompt: "infinite zoom. Movement: zoom continuously inward toward the exact center target. Speed: smooth accelerating zoom. Framing: keep the circular target centered as it expands. End: finish when the next visual world fills the frame.",
  },
  {
    id: "earth-zoom-out",
    name: "Earth zoom out",
    family: "SPECIALS",
    diagram: "zoom-out",
    prompt: "earth zoom out. Movement: pull upward from the starting point through street, city, landscape and planet scale. Speed: rapid expanding zoom out. Framing: keep the original location centered as scale grows. End: finish on a planet-scale view with the starting point still implied at center.",
  },
  {
    id: "time-lapse",
    name: "Time-lapse",
    family: "SPECIALS",
    diagram: "tracking",
    prompt: "locked-camera time-lapse. Movement: hold one fixed camera position while time moves rapidly forward. Speed: fast time compression with a stable camera. Framing: keep the same composition and horizon as motion passes through the frame. End: finish from the same camera angle with visible passage of time.",
  },
  {
    id: "pass-through-objects",
    name: "Pass-through objects",
    family: "SPECIALS",
    diagram: "tracking",
    prompt: "pass-through movement. Movement: move forward toward a visible object, surface or barrier and continue into the space beyond. Speed: smooth centered glide. Framing: keep the opening or surface centered as the transition point. End: arrive inside the revealed space beyond.",
  },
];

/** Bloque de movimientos en orden para pegar en un prompt. */
export function cameraMovementPrompt(ids: readonly string[] | null | undefined): string {
  if (!ids || ids.length === 0) return '';
  const selected = ids
    .map((id) => CAMERA_MOVEMENTS.find((movement) => movement.id === id))
    .filter((movement): movement is CameraMovement => !!movement);
  if (selected.length === 0) return '';
  return [
    'CAMERA MOVEMENTS (apply in this exact order):',
    ...selected.map((movement, index) => `${index + 1}. ${movement.name}: ${movement.prompt}`),
  ].join('\n');
}
