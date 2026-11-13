// Catálogo de iluminación generado desde
// `Cerebros app/lighting_templates.md` (copia en src/assets/lighting_templates.md).
// No editar a mano: regenerar con el script de conversión.

export interface LightingTemplate {
  id: string;
  name: string;
  /** Bloque de luz/dirección de arte que se inyecta en el prompt. */
  prompt: string;
}

export const LIGHTING_TEMPLATES: readonly LightingTemplate[] = [
  {
    id: "clamshell",
    name: "Clamshell",
    prompt: "LOOK LOCK - HIGHEST PRIORITY: every frame must look like it was shot on the set of @Imagen 1, with its lights, its lens and its color grade. Same mood, same light sources and directions, same light effects, same tone and color palette, same exposure, same brightness of the background, same contrast, same saturation, same shadows, same blacks, same highlights, same halation, haze, grain and patina, same skin color. The original bright, neutral look of @video1 (white-beige walls, light sofa, daylight) must disappear completely: the walls, the sofa, the shelf and every object of @video1 are re-lit and re-colored to match the background of @Imagen 1 - if the background of @Imagen 1 is dark, the room of @video1 becomes just as dark. Real light that wraps his face and body and reacts to every gesture of @video1 - never a flat filter, never a color overlay. His eyes stay natural, never glowing.\n.",
  },
  {
    id: "three-point",
    name: "Three-point",
    prompt: "LIGHTING STYLE - THREE-POINT, match it exactly:\n- EXPOSURE AND MOOD: Low, warm and intimate evening interior, the face NOT brighter than the room.\n- THE ROOM: The bright walls become a dim warm beige-amber that glows slightly brighter than the face, like a café at evening lit by warm practicals; the frame-left part of the room falls darker into brown; furniture a warm taupe; background soft and defocused.\n- LIGHT ON THE SUBJECT: A soft warm tungsten key from frame left in front of the subject: the frame-left side of the face lit, the frame-right side one stop darker in a soft gradual shadow; no rim light, no back light.\n- COLOR PALETTE: Amber, warm beige, olive green, brown, muted cream, golden-bronze skin.\n- SHADOWS AND BLACKS: Deep brown-black blacks, olive-brown shadows.\n- HIGHLIGHTS: Soft warm sand-beige, never white, never clipped.\n- CONTRAST AND SATURATION: Gentle low-medium contrast, muted natural saturation.\n- PATINA: Soft creamy film texture, fine grain, gentle bloom on the warm practicals.",
  },
  {
    id: "cross-lighting",
    name: "Cross lighting",
    prompt: "LIGHTING STYLE - CROSS LIGHTING, match it exactly:\n- EXPOSURE AND MOOD: Very dark, low-key, claustrophobic nightclub mood, about three stops under the original.\n- THE ROOM: The walls and furniture almost disappear into black; only blurry shapes of dark green light and a red-magenta glow remain in the background.\n- LIGHT ON THE SUBJECT: The face drenched in a dim hard green light from frame right; a red-magenta light from frame left touching the edge of the hair, cap and cheek; a dark shadow line down the middle of the face.\n- COLOR PALETTE: Deep bottle green, olive, black, touches of magenta-red and orange.\n- SHADOWS AND BLACKS: Crushed pure black everywhere outside the light.\n- HIGHLIGHTS: Dim green-yellow, never bright, never white.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Heavy grain, murky soft image, smoky darkness.",
  },
  {
    id: "kicker",
    name: "Kicker",
    prompt: "LIGHTING STYLE - KICKER, match it exactly:\n- EXPOSURE AND MOOD: Medium-low key, warm and intimate with a cool window behind.\n- THE ROOM: The walls become dim olive-brown with deep teal-green shadows; behind the subject on frame left the back wall glows with a bright cool mint-white window light; the rest of the room dark.\n- LIGHT ON THE SUBJECT: A warm golden kicker from behind on frame right skimming the edge of the cheek, jaw, ear, neck and shoulder with a hot edge; the front of the face softer and warm; cool window glow behind on frame left.\n- COLOR PALETTE: Warm gold skin, olive brown, teal-green, mint-white.\n- SHADOWS AND BLACKS: Deep near-black with a green tint.\n- HIGHLIGHTS: Warm golden on the skin edge, mint-white on the window glow.\n- CONTRAST AND SATURATION: High contrast, medium saturation.\n- PATINA: Rich 35mm film, fine grain, slight halation around the window glow.",
  },
  {
    id: "eye-light",
    name: "Eye light",
    prompt: "LIGHTING STYLE - EYE LIGHT, match it exactly:\n- EXPOSURE AND MOOD: Dark, hot and claustrophobic.\n- THE ROOM: The walls and furniture sink into a dark red-brown darkness, the background almost invisible.\n- LIGHT ON THE SUBJECT: A narrow horizontal band of warm light only across the eyes, following every head movement; the rest of the face in a dim red-orange shadow. The eyes stay natural, never glowing.\n- COLOR PALETTE: Rust red, brown, amber, olive-yellow.\n- SHADOWS AND BLACKS: Crushed red-black.\n- HIGHLIGHTS: Warm amber-yellow with small wet glints, never white.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Gritty 1990s 35mm film, coarse grain, a sickly warm cast.",
  },
  {
    id: "ring-light",
    name: "Ring light",
    prompt: "LIGHTING STYLE - RING LIGHT, match it exactly:\n- EXPOSURE AND MOOD: Low-key night interior, dim overall, the face moderately exposed, a warm intimate dressing-room mood.\n- THE ROOM: The bright walls become DARK: a dim dusty mauve-purple and blue-grey, with soft out-of-focus pink, lavender and baby-blue practical bokeh; shelves fall into shadow; nothing in the room stays bright or beige.\n- LIGHT ON THE SUBJECT: A soft warm frontal light from a ring light at the camera position, flat on the face, warm amber-orange, golden-brown skin; the ring light is never visible in frame. The eyes stay natural, never glowing, never lit up.\n- COLOR PALETTE: Warm amber-orange, dusty mauve, lavender, baby blue, hot-pink accents, brown.\n- SHADOWS AND BLACKS: Lifted dark brown-mauve, never pure black.\n- HIGHLIGHTS: Warm orange-cream, soft roll-off.\n- CONTRAST AND SATURATION: Medium contrast, medium saturation.\n- PATINA: Soft image, slight haze, gentle bloom on the practical lights, fine grain.",
  },
  {
    id: "direct-flash",
    name: "Direct flash",
    prompt: "LIGHTING STYLE - DIRECT FLASH, match it exactly:\n- EXPOSURE AND MOOD: Night, raw paparazzi snapshot: subject bright, background black.\n- THE ROOM: The back wall and niche fall to black and green-black; only the surfaces right next to the subject are hit by the flash and turn pale cream-yellow, with a fast falloff; a hard shadow of the subject on the wall right behind.\n- LIGHT ON THE SUBJECT: An on-camera flash from the lens position, hard and flat frontal, as a constant look in every frame with no flicker.\n- COLOR PALETTE: Black, dark bottle green, warm skin, pale cream-yellow on flashed surfaces.\n- SHADOWS AND BLACKS: Crushed green-black.\n- HIGHLIGHTS: Warm peach-cream, slightly blown.\n- CONTRAST AND SATURATION: Very high contrast, medium saturation.\n- PATINA: 35mm point-and-shoot film, heavy grain, slight vignette, a warm-green film tint.",
  },
  {
    id: "harsh-midday-sun",
    name: "Harsh midday sun",
    prompt: "LIGHTING STYLE - HARSH MIDDAY SUN, match it exactly:\n- EXPOSURE AND MOOD: Bright, hard summer daylight, restrained grade.\n- THE ROOM: Crisp patches of sunlight with sharp edges and dappled leaf shadows on the back wall and furniture; everything outside the sun patches in neutral grey shade.\n- LIGHT ON THE SUBJECT: Hard sun from high above on frame right: short hard shadows under the cap brim, the nose and the chin, squinting light.\n- COLOR PALETTE: Neutral greys, concrete grey, slate green-grey, muted brick.\n- SHADOWS AND BLACKS: Slightly lifted grey.\n- HIGHLIGHTS: Neutral white close to clipping.\n- CONTRAST AND SATURATION: High contrast between sun and shade, low saturation.\n- PATINA: Clean natural 35mm, fine grain.",
  },
  {
    id: "snow-light",
    name: "Snow light",
    prompt: "LIGHTING STYLE - SNOW LIGHT, match it exactly:\n- EXPOSURE AND MOOD: Bright, cold daylight, crisp.\n- THE ROOM: The walls become a cool blue-grey, the shadows cool, furniture a cold pale grey reflecting white light from below.\n- LIGHT ON THE SUBJECT: Soft overcast frontal light plus strong white bounce from below, filling under the cap brim, the chin and the eye sockets.\n- COLOR PALETTE: Cold white, steel blue, teal-grey, deep black, muted brown.\n- SHADOWS AND BLACKS: Deep blue-black.\n- HIGHLIGHTS: Cold mint-white.\n- CONTRAST AND SATURATION: Medium-high contrast, low-medium cool saturation.\n- PATINA: Crisp image, fine grain.",
  },
  {
    id: "lens-flare",
    name: "Lens flare",
    prompt: "LIGHTING STYLE - LENS FLARE, match it exactly:\n- EXPOSURE AND MOOD: Golden hour, warm, backlit and dreamy.\n- THE ROOM: Behind the subject the room becomes a glowing bright golden-white haze as if a low sun is behind; the walls in the shadow areas become warm amber-brown.\n- LIGHT ON THE SUBJECT: A low strong sun from behind the subject on frame right shining straight into the lens: golden rim on hair and cap, flare streaks and ghosts across the frame, veiling glare; the face in a warm bounce. The flare moves naturally with the camera.\n- COLOR PALETTE: Gold, amber, honey, warm brown, cream white.\n- SHADOWS AND BLACKS: Lifted warm brown haze, no true black.\n- HIGHLIGHTS: Pure white blooming highlights.\n- CONTRAST AND SATURATION: Low contrast from veiling glare, warm medium saturation.\n- PATINA: Golden haze, strong halation, flare ghosts, fine grain.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "lightning",
    name: "Lightning",
    prompt: "LIGHTING STYLE - LIGHTNING, match it exactly:\n- EXPOSURE AND MOOD: Dark stormy night, tense.\n- THE ROOM: The walls become dark teal-blue night, furniture dark blue-grey, the background almost black.\n- LIGHT ON THE SUBJECT: A cold dim moonlight; a few times at irregular moments a blue-white lightning flash from frame right blasts hard cold light across the subject and the room for a split second, then back to dark.\n- COLOR PALETTE: Deep teal, navy, cyan, cold white, faint violet.\n- SHADOWS AND BLACKS: Teal-black.\n- HIGHLIGHTS: Blue-white, clipped during the flashes, with a glow.\n- CONTRAST AND SATURATION: High contrast, medium-high cool saturation.\n- PATINA: Crisp cinematic image, fine grain.",
  },
  {
    id: "atmospheric-fog",
    name: "Atmospheric fog",
    prompt: "LIGHTING STYLE - ATMOSPHERIC FOG, match it exactly:\n- EXPOSURE AND MOOD: Cold, misty, quiet.\n- THE ROOM: The room fills with grey-beige haze; the back wall becomes a bright misty glow behind the subject; everything desaturated.\n- LIGHT ON THE SUBJECT: Soft daylight backlight from behind pouring through the haze in volumetric rays; the subject partly silhouetted with a soft frontal fill.\n- COLOR PALETTE: Grey, taupe, warm grey-white, desaturated olive.\n- SHADOWS AND BLACKS: Lifted grey, no true black.\n- HIGHLIGHTS: Warm grey-white.\n- CONTRAST AND SATURATION: Very low contrast, very low saturation.\n- PATINA: Volumetric rays, moving haze, soft image.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "sodium-vapour",
    name: "Sodium vapour",
    prompt: "LIGHTING STYLE - SODIUM VAPOUR, match it exactly:\n- EXPOSURE AND MOOD: Very dark gritty night.\n- THE ROOM: The walls become pure black except where the orange light hits, which turns orange-amber; furniture dark brown-orange.\n- LIGHT ON THE SUBJECT: An orange sodium streetlight from frame left above, the only light source.\n- COLOR PALETTE: Orange, amber, dark red-brown, black - no other color.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Amber-yellow, small glows around light sources.\n- CONTRAST AND SATURATION: Very high contrast, high warm saturation.\n- PATINA: Gritty grain, deep blacks.",
  },
  {
    id: "fluorescent",
    name: "Fluorescent",
    prompt: "LIGHTING STYLE - FLUORESCENT, match it exactly:\n- EXPOSURE AND MOOD: Flat, tired, institutional.\n- THE ROOM: The background becomes out of focus with long bright white fluorescent tube shapes in bokeh along the top; the walls a dim warm grey-beige with teal-grey tones.\n- LIGHT ON THE SUBJECT: Flat top light from fluorescent tubes above, shadows in the eye sockets under the cap brim, a slight sheen on the skin.\n- COLOR PALETTE: Warm grey, beige, teal-navy, cream-white tubes.\n- SHADOWS AND BLACKS: Neutral dark grey.\n- HIGHLIGHTS: Blown warm white tubes.\n- CONTRAST AND SATURATION: Medium contrast, low-medium saturation.\n- PATINA: Clean digital cinema, shallow depth of field, soft bokeh.",
  },
  {
    id: "bare-bulb",
    name: "Bare bulb",
    prompt: "LIGHTING STYLE - BARE BULB, match it exactly:\n- EXPOSURE AND MOOD: Low-key, gritty, sweaty basement.\n- THE ROOM: The walls become dark grimy brown-olive and amber, with a cold blue-grey patch on one side; a hot bulb glow at the top edge of the frame.\n- LIGHT ON THE SUBJECT: A naked bulb hanging just above the frame: hard warm top light, hot highlights on the cap top and shoulders, deep shadow under the brim, fast falloff, a sweaty sheen.\n- COLOR PALETTE: Amber, brown, ochre, olive, small cold blue-grey accents.\n- SHADOWS AND BLACKS: Crushed.\n- HIGHLIGHTS: Warm amber.\n- CONTRAST AND SATURATION: High contrast, high warm saturation.\n- PATINA: 1990s 35mm film, grain.",
  },
  {
    id: "flashlight",
    name: "Flashlight",
    prompt: "LIGHTING STYLE - FLASHLIGHT, match it exactly:\n- EXPOSURE AND MOOD: Dim, cold, clinical.\n- THE ROOM: The walls become a dim teal-grey and blue-green, out of focus, with soft round pale bokeh.\n- LIGHT ON THE SUBJECT: A flashlight beam from off-screen near the camera onto the subject, a hard pool of light on face and chest with a sharp falloff, slightly wobbling.\n- COLOR PALETTE: Teal, cyan-grey, muted mint, warm orange-white from the torch.\n- SHADOWS AND BLACKS: Lifted blue-grey.\n- HIGHLIGHTS: Mint-white, the source hot warm-white.\n- CONTRAST AND SATURATION: Medium-low contrast, medium saturation.\n- PATINA: Soft image, shallow depth of field, glow.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "dashboard-light",
    name: "Dashboard light",
    prompt: "LIGHTING STYLE - DASHBOARD LIGHT, match it exactly:\n- EXPOSURE AND MOOD: Night, hypnotic, almost monochrome cyan.\n- THE ROOM: The whole room becomes a deep blue darkness with cyan light pooling on the surfaces near the subject; the upper part of the walls washed in cyan.\n- LIGHT ON THE SUBJECT: A soft cyan glow from below and in front lighting the underside of the chin, nose and cap brim.\n- COLOR PALETTE: Electric cyan, turquoise, deep navy, black.\n- SHADOWS AND BLACKS: Black-blue.\n- HIGHLIGHTS: Electric cyan.\n- CONTRAST AND SATURATION: Medium contrast, extreme saturation.\n- PATINA: Smoky haze, soft glow.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "police-lights",
    name: "Police lights",
    prompt: "LIGHTING STYLE - POLICE LIGHTS, match it exactly:\n- EXPOSURE AND MOOD: Almost total darkness, tense night.\n- THE ROOM: The walls are barely visible, almost black; blurred red-magenta and blue lights glow on the frame-left and frame-right edges as through windows.\n- LIGHT ON THE SUBJECT: A dim warm red-brown light on the face; alternating red and blue flashes sweep across the subject in a steady rhythm; a sweaty sheen.\n- COLOR PALETTE: Black, deep brown, magenta-red, violet-blue.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Small magenta and blue highlights.\n- CONTRAST AND SATURATION: Extremely low key, high saturation in the lights.\n- PATINA: Grain, sweaty sheen, dotted bokeh.",
  },
  {
    id: "string-lights",
    name: "String lights",
    prompt: "LIGHTING STYLE - STRING LIGHTS, match it exactly:\n- EXPOSURE AND MOOD: Warm festive night.\n- THE ROOM: The walls become a warm cream-beige softly lit by many small warm bulbs strung across the background out of focus; plants dark green.\n- LIGHT ON THE SUBJECT: Soft warm light from the bulbs on the subject.\n- COLOR PALETTE: Warm cream, golden, olive green, brown, dark green.\n- SHADOWS AND BLACKS: Olive-brown.\n- HIGHLIGHTS: Warm cream.\n- CONTRAST AND SATURATION: Medium contrast, medium saturation.\n- PATINA: Warm soft image, slight haze, glow around the bulbs.",
  },
  {
    id: "projector-beam",
    name: "Projector beam",
    prompt: "LIGHTING STYLE - PROJECTOR BEAM, match it exactly:\n- EXPOSURE AND MOOD: Dark, awe, cinema.\n- THE ROOM: The background behind the subject becomes dark teal-green with two huge bright beams fanning out from behind toward the lens: frame left white-yellow-orange, frame right cyan-white-orange-pink.\n- LIGHT ON THE SUBJECT: The face dim from the front, warm-neutral, flickering slightly with the projected image.\n- COLOR PALETTE: Dark teal, olive, white-yellow, cyan, orange, pink.\n- SHADOWS AND BLACKS: Dark teal.\n- HIGHLIGHTS: White.\n- CONTRAST AND SATURATION: High contrast, high saturation in the beams.\n- PATINA: Haze, glow, flare.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "stained-glass",
    name: "Stained glass",
    prompt: "LIGHTING STYLE - STAINED GLASS, match it exactly:\n- EXPOSURE AND MOOD: Dark, sacred, contemplative.\n- THE ROOM: The room becomes dark navy-teal; the back wall glows with tall stained-glass windows in out-of-focus bokeh: blue, cyan-white, amber and red jewel colors.\n- LIGHT ON THE SUBJECT: The subject partly silhouetted, face in soft shadow with a cool rim from behind; a soft beam from the top.\n- COLOR PALETTE: Navy, deep blue, cyan, pale gold, red sparks.\n- SHADOWS AND BLACKS: Dark navy.\n- HIGHLIGHTS: Cyan-white glowing windows.\n- CONTRAST AND SATURATION: High contrast, medium-high saturation.\n- PATINA: Haze, soft image.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "searchlight",
    name: "Searchlight",
    prompt: "LIGHTING STYLE - SEARCHLIGHT, match it exactly:\n- EXPOSURE AND MOOD: Black night, tension.\n- THE ROOM: The room is pure black.\n- LIGHT ON THE SUBJECT: One hard searchlight beam from high above on frame left cuts diagonally through haze and sweeps slowly over the subject; he is almost a silhouette with an edge of light.\n- COLOR PALETTE: Black, navy, pale cyan-white.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Pale cyan-white beam.\n- CONTRAST AND SATURATION: Extreme contrast, low saturation.\n- PATINA: Haze, fine grain.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "explosion",
    name: "Explosion",
    prompt: "LIGHTING STYLE - EXPLOSION, match it exactly:\n- EXPOSURE AND MOOD: Dramatic, chaotic.\n- THE ROOM: Frame left becomes a teal-cyan backlight bursting through smoke from behind the subject; frame right a big orange-yellow fire glow; the walls dark.\n- LIGHT ON THE SUBJECT: The subject almost silhouetted with a hot rim; the fire light flickers and pulses on the frame-right side.\n- COLOR PALETTE: Teal, cyan, orange, yellow, black.\n- SHADOWS AND BLACKS: Teal-black.\n- HIGHLIGHTS: Yellow-orange fire, cyan-white backlight.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Smoke, haze, volumetric rays, glow.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "muzzle-flash",
    name: "Muzzle flash",
    prompt: "LIGHTING STYLE - MUZZLE FLASH, match it exactly:\n- EXPOSURE AND MOOD: Gritty, raw action.\n- THE ROOM: The walls become a dirty mint and pale green, a warm tungsten bulb glowing at the top left, the ceiling darker.\n- LIGHT ON THE SUBJECT: Warm dim light; a few times at irregular moments a split-second burst of bright white-yellow light from off-screen frame right flashes on the subject, then back to dim. Light only: no gun, nothing visible.\n- COLOR PALETTE: Mint green, olive, warm amber, brown, white.\n- SHADOWS AND BLACKS: Warm brown-black.\n- HIGHLIGHTS: Flashes blown to white.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: 1990s 35mm film, grain, a slight smear.",
  },
  {
    id: "laser-lights",
    name: "Laser lights",
    prompt: "LIGHTING STYLE - LASER LIGHTS, match it exactly:\n- EXPOSURE AND MOOD: Dark, flat, mysterious.\n- THE ROOM: The room becomes flat dark navy-black, the walls invisible.\n- LIGHT ON THE SUBJECT: A thin glowing red laser line crosses the frame horizontally at the height of the eyes and nose, sweeping slowly, a red glow where it touches the skin; a dim blue ambient on the face.\n- COLOR PALETTE: Navy, dark blue, red laser line, faint magenta.\n- SHADOWS AND BLACKS: Lifted murky purple-grey.\n- HIGHLIGHTS: Magenta-red, only on the line.\n- CONTRAST AND SATURATION: Very low contrast, low saturation except the laser.\n- PATINA: 16mm feel, heavy grain, soft murky image, a slight vignette.\nATMOSPHERE RULE: the haze, the volumetric light and the particles in the air are always present and always moving, for the entire duration, never static.",
  },
  {
    id: "blacklight-uv",
    name: "Blacklight (UV)",
    prompt: "LIGHTING STYLE - BLACKLIGHT (UV), match it exactly:\n- EXPOSURE AND MOOD: Dark club, electric.\n- THE ROOM: The room becomes deep ultramarine-violet darkness.\n- LIGHT ON THE SUBJECT: Ultraviolet blacklight: white cap and white print on clothing glow brightly, the skin purple-blue.\n- COLOR PALETTE: Ultramarine, violet, neon orange, magenta, glowing white.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Glowing whites and neon.\n- CONTRAST AND SATURATION: High contrast, extreme saturation.\n- PATINA: Glow, slight bloom.",
  },
  {
    id: "bi-color-light",
    name: "Bi-color light",
    prompt: "LIGHTING STYLE - BI-COLOR LIGHT, match it exactly:\n- EXPOSURE AND MOOD: Night party, cool and seductive.\n- THE ROOM: The background becomes dark blue with glittering blue, cyan and orange bokeh sparkles.\n- LIGHT ON THE SUBJECT: A magenta-red key on the face from frame right, deep blue light from frame left and on the background.\n- COLOR PALETTE: Royal blue, cyan, magenta-red, orange specks.\n- SHADOWS AND BLACKS: Dark navy.\n- HIGHLIGHTS: Blue-lavender, magenta-red on the skin.\n- CONTRAST AND SATURATION: Medium-high contrast, high saturation.\n- PATINA: Shallow depth of field, sparkly bokeh.",
  },
  {
    id: "mixed-colour-temperature",
    name: "Mixed colour temperature",
    prompt: "LIGHTING STYLE - MIXED COLOUR TEMPERATURE, match it exactly:\n- EXPOSURE AND MOOD: Warm afternoon, stylish.\n- THE ROOM: Frame left: bright golden sun pouring through warm yellow curtains; the rest of the room in cool teal-blue shade; furniture warm orange-brown; a hard streak of sun on the floor.\n- LIGHT ON THE SUBJECT: Warm golden sunlight on the subject from frame left, cool teal fill on the other side.\n- COLOR PALETTE: Orange, rust, golden yellow, teal, deep green.\n- SHADOWS AND BLACKS: Reddish brown.\n- HIGHLIGHTS: Warm cream-yellow.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Rich warm 35mm.",
  },
  {
    id: "cast-shadow",
    name: "Cast shadow",
    prompt: "LIGHTING STYLE - CAST SHADOW, match it exactly:\n- EXPOSURE AND MOOD: Warm, expressionist.\n- THE ROOM: The back wall becomes a warm golden-amber lit by a hard light, with a large hard shadow of the subject on it moving with every gesture; the edges of the frame dark brown-black.\n- LIGHT ON THE SUBJECT: A single hard warm low light from frame left.\n- COLOR PALETTE: Golden amber, honey, burnt orange, dark brown, black.\n- SHADOWS AND BLACKS: Near-black warm.\n- HIGHLIGHTS: Golden peach.\n- CONTRAST AND SATURATION: High contrast, high warm saturation.\n- PATINA: Warm grain.",
  },
  {
    id: "city-bokeh",
    name: "City bokeh",
    prompt: "LIGHTING STYLE - CITY BOKEH, match it exactly:\n- EXPOSURE AND MOOD: Cool dusk, melancholic.\n- THE ROOM: The background becomes heavily defocused, cool blue-grey dusk, with round bokeh lights in pink, red and white; the walls blue-grey.\n- LIGHT ON THE SUBJECT: Soft cool dusk light on the face.\n- COLOR PALETTE: Slate blue, grey, muted teal, pink-red, white.\n- SHADOWS AND BLACKS: Slightly lifted blue-grey.\n- HIGHLIGHTS: Cool white.\n- CONTRAST AND SATURATION: Medium contrast, low saturation.\n- PATINA: Soft, natural, fine grain.",
  },
  {
    id: "bloom-halation",
    name: "Bloom / halation",
    prompt: "THE LOOK OF @Imagen 31 - CITY BOKEH, match it exactly:\n- EXPOSURE AND MOOD: Cool dusk, melancholic.\n- THE ROOM: The background becomes heavily defocused, cool blue-grey dusk, with round bokeh lights in pink, red and white; the walls blue-grey.\n- LIGHT ON HIM: Soft cool dusk light on his face.\n- COLOR PALETTE: Slate blue, grey, muted teal, pink-red, white.\n- SHADOWS AND BLACKS: Slightly lifted blue-grey.\n- HIGHLIGHTS: Cool white.\n- CONTRAST AND SATURATION: Medium contrast, low saturation.\n- PATINA: Soft, natural, fine grain.",
  },
];

/** Devuelve el bloque listo para pegar en un prompt de video o imagen. */
export function lightingPrompt(id: string | null | undefined): string {
  if (!id) return '';
  const template = LIGHTING_TEMPLATES.find((item) => item.id === id);
  if (!template) return '';
  return [
    'LIGHTING AND ART DIRECTION - ' + template.name,
    template.prompt,
    'Apply this lighting scheme coherently to every shot, frame and generated clip: same light sources and directions, colour palette, contrast and mood across the whole piece.',
  ].join('\n');
}
