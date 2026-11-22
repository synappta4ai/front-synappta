// Catálogo de Looks (esquemas de luz y color) generado desde
// back-synappta/internal/Prompt/looks_templates.md.
// Set 1 = formato largo (31); Set 2 = formato corto (31).
// El prompt final se ensambla en el back (internal/looks); acá solo se
// muestran nombres, miniaturas y descripciones en la UI.

export type LookIntensity = 'subtle' | 'medium' | 'strong';

export const DEFAULT_LOOK_INTENSITY: LookIntensity = 'medium';

export interface LightingTemplate {
  id: string;
  name: string;
  /** 1 = formato largo; 2 = formato corto. */
  set: 1 | 2;
  /** Look redactado sin captura original. */
  draft: boolean;
  /** Miniatura del esquema (src/assets/lighting). */
  thumb: string;
  /** Descripción corta en español. */
  descriptionEs: string;
  /** Descripción corta en inglés. */
  descriptionEn: string;
  /** Bloque del look (Set 1: transferible + condicional. Set 2: descripción + GUARD). */
  prompt: string;
}

export const LIGHTING_TEMPLATES: readonly LightingTemplate[] = [
  {
    id: 'clamshell',
    name: 'Clamshell',
    set: 1,
    draft: true,
    thumb: '/assets/lighting/clamshell.webp',
    descriptionEs:
      'Luz suave frontal en dos fuentes; re-ilumina la escena con un look cálido y cinematográfico.',
    descriptionEn: 'Bright, soft, flattering beauty look, clean and intimate.',
    prompt:
      'LOOK - CLAMSHELL. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Bright, soft, flattering beauty look, clean and intimate.\n- COLOR PALETTE: Natural clean skin tones, soft neutral whites, muted background colors.\n- SHADOWS AND BLACKS: Gently lifted soft blacks, no crushed shadows.\n- HIGHLIGHTS: Soft creamy skin highlights, never clipped.\n- CONTRAST AND SATURATION: Low-medium contrast, natural saturation.\n- PATINA: Fine natural grain, clean polished beauty finish.\n- LIGHT QUALITY AND DIRECTION: Two large soft sources in a clamshell: a soft key from above the lens and a soft fill from below, wrapping the face evenly, small catchlights, minimal shadows under the chin and eyes.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- The surroundings stay soft and slightly darker than the face, gently falling off behind the subject, no hard background light. Never show the lights.',
  },
  {
    id: 'three-point',
    name: 'Three-point',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/three-point.webp',
    descriptionEs:
      'Clave cálida desde la izquierda, relleno suave y contraluz; retrato clásico de tres puntos.',
    descriptionEn:
      'Low, warm and intimate evening interior; the face is NOT brighter than the room.',
    prompt:
      'LOOK - THREE-POINT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Low, warm and intimate evening interior; the face is NOT brighter than the room.\n- COLOR PALETTE: Amber, warm beige, olive green, brown, muted cream, golden-bronze skin.\n- SHADOWS AND BLACKS: Deep brown-black blacks, olive-brown shadows.\n- HIGHLIGHTS: Soft warm sand-beige, never white, never clipped.\n- CONTRAST AND SATURATION: Gentle low-medium contrast, muted natural saturation.\n- PATINA: Soft creamy film texture, fine grain, gentle bloom on warm practicals.\n- LIGHT QUALITY AND DIRECTION: A soft warm tungsten-like key from one side in front of the subject: that side of the face lit, the other side one stop darker in a soft gradual shadow; no rim light, no back light.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Background shifts toward a dim warm beige-amber that glows slightly brighter than the face, soft and defocused, like a cafe at evening; warm practicals only if the location can host them, otherwise warm the existing sources.',
  },
  {
    id: 'cross-lighting',
    name: 'Cross lighting',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/cross-lighting.webp',
    descriptionEs:
      'Luz dura verde desde un lado y magenta desde el otro; noche de club, alto contraste.',
    descriptionEn:
      'Very dark, low-key, claustrophobic nightclub mood, about three stops under the original.',
    prompt:
      'LOOK - CROSS LIGHTING. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Very dark, low-key, claustrophobic nightclub mood, about three stops under the original.\n- COLOR PALETTE: Deep bottle green, olive, black, touches of magenta-red and orange.\n- SHADOWS AND BLACKS: Crushed pure black outside the light.\n- HIGHLIGHTS: Dim green-yellow, never bright, never white.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Heavy grain, murky soft image, smoky darkness.\n- LIGHT QUALITY AND DIRECTION: Two opposed colored lights: a dim hard green from one side and a red-magenta from the other touching the edge of hair and cheek, with a dark shadow line down the middle of the face.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Walls and objects sink toward black; blurry dark green and red-magenta light shapes in the background only if there is depth or space for them.',
  },
  {
    id: 'kicker',
    name: 'Kicker',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/kicker.webp',
    descriptionEs:
      'Luz cálida de contra desde atrás y ventana fría al fondo; borde dorado en el rostro.',
    descriptionEn: 'Medium-low key, warm and intimate with a cool contrast behind.',
    prompt:
      'LOOK - KICKER. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Medium-low key, warm and intimate with a cool contrast behind.\n- COLOR PALETTE: Warm gold skin, olive brown, teal-green, mint-white.\n- SHADOWS AND BLACKS: Deep near-black with a green tint.\n- HIGHLIGHTS: Warm golden on the skin edge, mint-white on the cool glow.\n- CONTRAST AND SATURATION: High contrast, medium saturation.\n- PATINA: Rich 35mm film, fine grain, slight halation around bright cool areas.\n- LIGHT QUALITY AND DIRECTION: A warm golden kicker from behind and to one side skimming cheek, jaw, ear, neck and shoulder with a hot edge; the front of the face softer and warm.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Surroundings lean dim olive-brown with deep teal-green shadows. A cool mint-white glow behind the subject ONLY if there is a window, opening or bright area; otherwise use a cool ambient glow or none.',
  },
  {
    id: 'eye-light',
    name: 'Eye light',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/eye-light.webp',
    descriptionEs:
      'Banda horizontal de luz solo en los ojos; rostro en sombra rojiza, tensión íntima.',
    descriptionEn: 'Dark, hot and claustrophobic.',
    prompt:
      'LOOK - EYE LIGHT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dark, hot and claustrophobic.\n- COLOR PALETTE: Rust red, brown, amber, olive-yellow.\n- SHADOWS AND BLACKS: Crushed red-black.\n- HIGHLIGHTS: Warm amber-yellow with small wet glints, never white.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Gritty 1990s 35mm film, coarse grain, a sickly warm cast.\n- LIGHT QUALITY AND DIRECTION: A narrow horizontal band of warm light only across the eyes, following every head movement (video); the rest of the face in a dim red-orange shadow. Eyes stay natural, never glowing.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Surroundings sink into dark red-brown darkness, background almost invisible. If the subject is not a person, use a narrow warm band over the focal area.',
  },
  {
    id: 'ring-light',
    name: 'Ring light',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/ring-light.webp',
    descriptionEs: 'Luz frontal suave de anillo; piel ámbar y fondo lavanda con bokeh.',
    descriptionEn:
      'Low-key night interior, dim overall, face moderately exposed, warm intimate dressing-room mood.',
    prompt:
      'LOOK - RING LIGHT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Low-key night interior, dim overall, face moderately exposed, warm intimate dressing-room mood.\n- COLOR PALETTE: Warm amber-orange, dusty mauve, lavender, baby blue, hot-pink accents, brown.\n- SHADOWS AND BLACKS: Lifted dark brown-mauve, never pure black.\n- HIGHLIGHTS: Warm orange-cream, soft roll-off.\n- CONTRAST AND SATURATION: Medium contrast, medium saturation.\n- PATINA: Soft image, slight haze, gentle bloom on practicals.\n- LIGHT QUALITY AND DIRECTION: A soft warm frontal light from the camera position, flat on the face, warm amber-orange, golden-brown skin. The ring light is never visible. Eyes stay natural.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Background tints toward dusty mauve and blue-grey; soft pink, lavender and baby-blue practical bokeh only if the scene has lights or depth to support them.',
  },
  {
    id: 'direct-flash',
    name: 'Direct flash',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/direct-flash.webp',
    descriptionEs: 'Flash directo de cámara; sujeto brillante, fondo negro, look paparazzi.',
    descriptionEn: 'Night, raw paparazzi snapshot: subject bright, background dark.',
    prompt:
      'LOOK - DIRECT FLASH. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Night, raw paparazzi snapshot: subject bright, background dark.\n- COLOR PALETTE: Black, dark bottle green, warm skin, pale cream-yellow on flashed surfaces.\n- SHADOWS AND BLACKS: Crushed green-black.\n- HIGHLIGHTS: Warm peach-cream, slightly blown.\n- CONTRAST AND SATURATION: Very high contrast, medium saturation.\n- PATINA: 35mm point-and-shoot film, heavy grain, slight vignette, warm-green tint.\n- LIGHT QUALITY AND DIRECTION: On-camera flash from the lens position: hard flat frontal light, fast falloff, constant in every frame without flicker.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Surfaces close to the subject catch the flash and turn pale cream-yellow; the far background falls to black. A hard shadow of the subject on the wall ONLY if a wall is close behind.',
  },
  {
    id: 'harsh-midday-sun',
    name: 'Harsh midday sun',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/harsh-midday-sun.webp',
    descriptionEs: 'Sol duro de mediodía desde arriba; sombras cortas y contraste alto.',
    descriptionEn: 'Bright, hard summer daylight, restrained grade.',
    prompt:
      'LOOK - HARSH MIDDAY SUN. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Bright, hard summer daylight, restrained grade.\n- COLOR PALETTE: Neutral greys, concrete grey, slate green-grey, muted brick.\n- SHADOWS AND BLACKS: Slightly lifted grey.\n- HIGHLIGHTS: Neutral white close to clipping.\n- CONTRAST AND SATURATION: High contrast between sun and shade, low saturation.\n- PATINA: Clean natural 35mm, fine grain.\n- LIGHT QUALITY AND DIRECTION: Hard overhead sun: short hard shadows under brims, noses and chins; areas outside direct sun fall into neutral grey shade.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Crisp sunlit patches only on surfaces actually exposed to sun. Dappled leaf shadows ONLY if there is foliage; NEVER invent blinds, window grids or foliage shadows.',
  },
  {
    id: 'snow-light',
    name: 'Snow light',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/snow-light.webp',
    descriptionEs: 'Luz fría de día nublado con rebote blanco desde abajo; tonos azul-gris.',
    descriptionEn: 'Bright, cold daylight, crisp.',
    prompt:
      'LOOK - SNOW LIGHT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Bright, cold daylight, crisp.\n- COLOR PALETTE: Cold white, steel blue, teal-grey, deep black, muted brown.\n- SHADOWS AND BLACKS: Deep blue-black.\n- HIGHLIGHTS: Cold mint-white.\n- CONTRAST AND SATURATION: Medium-high contrast, low-medium cool saturation.\n- PATINA: Crisp image, fine grain.\n- LIGHT QUALITY AND DIRECTION: Soft overcast frontal light plus a strong white bounce from below, filling eye sockets, chin and any brim shadows.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Surfaces lean cool blue-grey and reflect white light from below; existing materials stay recognizable.',
  },
  {
    id: 'lens-flare',
    name: 'Lens flare',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/lens-flare.webp',
    descriptionEs: 'Sol bajo a contraluz con flares y bruma dorada; atardecer soñador.',
    descriptionEn: 'Golden hour, warm, backlit and dreamy.',
    prompt:
      'LOOK - LENS FLARE. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Golden hour, warm, backlit and dreamy.\n- COLOR PALETTE: Gold, amber, honey, warm brown, cream white.\n- SHADOWS AND BLACKS: Lifted warm brown haze, no true black.\n- HIGHLIGHTS: Pure white blooming highlights.\n- CONTRAST AND SATURATION: Low contrast from veiling glare, warm medium saturation.\n- PATINA: Golden haze, strong halation, flare ghosts, fine grain.\n- LIGHT QUALITY AND DIRECTION: A low strong sun behind the subject toward the lens: golden rim on hair and edges, soft flare streaks and veiling glare, the face in warm bounce.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Flare streaks and ghosts move naturally with the camera; the background becomes a glowing golden haze only where there is open space or sky behind.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'lightning',
    name: 'Lightning',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/lightning.webp',
    descriptionEs: 'Noche de tormenta con destellos azul-blancos intermitentes; teal oscuro.',
    descriptionEn: 'Dark stormy night, tense.',
    prompt:
      'LOOK - LIGHTNING. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dark stormy night, tense.\n- COLOR PALETTE: Deep teal, navy, cyan, cold white, faint violet.\n- SHADOWS AND BLACKS: Teal-black.\n- HIGHLIGHTS: Blue-white, clipped during the flashes, with a glow.\n- CONTRAST AND SATURATION: High contrast, medium-high cool saturation.\n- PATINA: Crisp cinematic image, fine grain.\n- LIGHT QUALITY AND DIRECTION: Cold dim moonlight as base; at irregular moments (video) or as one frozen flash (still) a blue-white lightning blast hits from one side.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Surroundings go dark teal-blue night; existing objects stay visible as dark blue-grey shapes.',
  },
  {
    id: 'atmospheric-fog',
    name: 'Atmospheric fog',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/atmospheric-fog.webp',
    descriptionEs: 'Niebla volumétrica y contraluz suave; imagen desaturada y fría.',
    descriptionEn: 'Cold, misty, quiet.',
    prompt:
      'LOOK - ATMOSPHERIC FOG. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Cold, misty, quiet.\n- COLOR PALETTE: Grey, taupe, warm grey-white, desaturated olive.\n- SHADOWS AND BLACKS: Lifted grey, no true black.\n- HIGHLIGHTS: Warm grey-white.\n- CONTRAST AND SATURATION: Very low contrast, very low saturation.\n- PATINA: Volumetric rays, moving haze, soft image.\n- LIGHT QUALITY AND DIRECTION: Soft daylight backlight through haze with a soft frontal fill; subject partly silhouetted; everything desaturated.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Volumetric rays and a misty back glow wherever there is depth behind the subject.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'sodium-vapour',
    name: 'Sodium vapour',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/sodium-vapour.webp',
    descriptionEs: 'Farola naranja de sodio como única fuente; negros puros y ámbar.',
    descriptionEn: 'Very dark gritty night.',
    prompt:
      'LOOK - SODIUM VAPOUR. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Very dark gritty night.\n- COLOR PALETTE: Orange, amber, dark red-brown, black; dominated by orange.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Amber-yellow, small glows around light sources.\n- CONTRAST AND SATURATION: Very high contrast, high warm saturation.\n- PATINA: Gritty grain, deep blacks.\n- LIGHT QUALITY AND DIRECTION: An orange sodium streetlight from above and to one side as the dominant light source.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Surfaces outside the orange light fall to black; a visible lamp only if it fits the location, otherwise keep it off-screen.',
  },
  {
    id: 'fluorescent',
    name: 'Fluorescent',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/fluorescent.webp',
    descriptionEs: 'Tubos fluorescentes cenitales; luz plana institucional y bokeh blanco.',
    descriptionEn: 'Flat, tired, institutional.',
    prompt:
      'LOOK - FLUORESCENT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Flat, tired, institutional.\n- COLOR PALETTE: Warm grey, beige, teal-navy, cream-white.\n- SHADOWS AND BLACKS: Neutral dark grey.\n- HIGHLIGHTS: Blown warm white.\n- CONTRAST AND SATURATION: Medium contrast, low-medium saturation.\n- PATINA: Clean digital cinema, shallow depth of field, soft bokeh.\n- LIGHT QUALITY AND DIRECTION: Flat top light from above, shadows in eye sockets and under brims, slight sheen on the skin.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Out-of-focus long bright tube shapes in the background ONLY if the location has overhead fixtures; otherwise keep only the flat greenish-white top light.',
  },
  {
    id: 'bare-bulb',
    name: 'Bare bulb',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/bare-bulb.webp',
    descriptionEs: 'Bombilla desnuda sobre la escena; luz dura cálida y sombras profundas.',
    descriptionEn: 'Low-key, gritty, sweaty basement.',
    prompt:
      'LOOK - BARE BULB. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Low-key, gritty, sweaty basement.\n- COLOR PALETTE: Amber, brown, ochre, olive, small cold blue-grey accents.\n- SHADOWS AND BLACKS: Crushed.\n- HIGHLIGHTS: Warm amber.\n- CONTRAST AND SATURATION: High contrast, high warm saturation.\n- PATINA: 1990s 35mm film, grain.\n- LIGHT QUALITY AND DIRECTION: Hard warm top light from a single bulb just above the frame: hot highlights on head and shoulders, deep shadow under brims, fast falloff, sweaty sheen.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Bulb glow at the top edge only if framing allows; surroundings lean grimy brown-olive and amber.',
  },
  {
    id: 'flashlight',
    name: 'Flashlight',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/flashlight.webp',
    descriptionEs: 'Haz de linterna desde cámara; pool de luz duro con caída rápida.',
    descriptionEn: 'Dim, cold, clinical.',
    prompt:
      'LOOK - FLASHLIGHT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dim, cold, clinical.\n- COLOR PALETTE: Teal, cyan-grey, muted mint, warm orange-white from the torch.\n- SHADOWS AND BLACKS: Lifted blue-grey.\n- HIGHLIGHTS: Mint-white, the source hot warm-white.\n- CONTRAST AND SATURATION: Medium-low contrast, medium saturation.\n- PATINA: Soft image, shallow depth of field, glow.\n- LIGHT QUALITY AND DIRECTION: A flashlight beam from near the camera: a hard pool of light on the subject with sharp falloff, slightly wobbling in video.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Background in dim teal-grey with soft round pale bokeh where there is depth.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'dashboard-light',
    name: 'Dashboard light',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/dashboard-light.webp',
    descriptionEs: 'Resplandor cian desde abajo; noche casi monocroma azul.',
    descriptionEn: 'Night, hypnotic, close to monochrome cyan.',
    prompt:
      'LOOK - DASHBOARD LIGHT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Night, hypnotic, close to monochrome cyan.\n- COLOR PALETTE: Electric cyan, turquoise, deep navy, black.\n- SHADOWS AND BLACKS: Black-blue.\n- HIGHLIGHTS: Electric cyan.\n- CONTRAST AND SATURATION: Medium contrast, extreme saturation.\n- PATINA: Smoky haze, soft glow.\n- LIGHT QUALITY AND DIRECTION: Soft cyan glow from below and in front, lighting the underside of chin, nose and brims.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Cyan pools on nearby surfaces; the rest deepens to blue darkness while its own colors stay faintly readable. Do NOT paint the whole scene one flat color.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'police-lights',
    name: 'Police lights',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/police-lights.webp',
    descriptionEs: 'Destellos rojos y azules alternados en la oscuridad; tensión nocturna.',
    descriptionEn: 'Almost total darkness, tense night.',
    prompt:
      'LOOK - POLICE LIGHTS. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Almost total darkness, tense night.\n- COLOR PALETTE: Black, deep brown, magenta-red, violet-blue.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Small magenta and blue highlights.\n- CONTRAST AND SATURATION: Extremely low key, high saturation in the lights.\n- PATINA: Grain, sweaty sheen, dotted bokeh.\n- LIGHT QUALITY AND DIRECTION: Dim warm red-brown base light on the subject with alternating red and blue sweeps in a steady rhythm (video) or a red/blue split (still).\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Blurred red and blue glows at frame edges as if through windows, only if the location can plausibly have them.',
  },
  {
    id: 'string-lights',
    name: 'String lights',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/string-lights.webp',
    descriptionEs: 'Guirnalda de bombillas cálidas al fondo; ambiente festivo y suave.',
    descriptionEn: 'Warm festive night.',
    prompt:
      'LOOK - STRING LIGHTS. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Warm festive night.\n- COLOR PALETTE: Warm cream, golden, olive green, brown, dark green.\n- SHADOWS AND BLACKS: Olive-brown.\n- HIGHLIGHTS: Warm cream.\n- CONTRAST AND SATURATION: Medium contrast, medium saturation.\n- PATINA: Warm soft image, slight haze, glow around bulbs.\n- LIGHT QUALITY AND DIRECTION: Soft warm light on the subject from many small warm sources.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Out-of-focus string bulbs in the background ONLY if the scene is outdoors or has space for them; otherwise use scattered warm practicals.',
  },
  {
    id: 'projector-beam',
    name: 'Projector beam',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/projector-beam.webp',
    descriptionEs: 'Haces de proyector desde atrás; teal oscuro con abanicos de color.',
    descriptionEn: 'Dark, awe, cinema.',
    prompt:
      'LOOK - PROJECTOR BEAM. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dark, awe, cinema.\n- COLOR PALETTE: Dark teal, olive, white-yellow, cyan, orange, pink.\n- SHADOWS AND BLACKS: Dark teal.\n- HIGHLIGHTS: White.\n- CONTRAST AND SATURATION: High contrast, high saturation in the beams.\n- PATINA: Haze, glow, flare.\n- LIGHT QUALITY AND DIRECTION: Face dim and warm-neutral from the front, flickering slightly with the projected image (video).\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Fanning colored beams from behind toward the lens, only if there is open depth behind the subject.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'stained-glass',
    name: 'Stained glass',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/stained-glass.webp',
    descriptionEs: 'Ventanas de vitral al fondo; luz sagrada azul y ámbar.',
    descriptionEn: 'Dark, sacred, contemplative.',
    prompt:
      'LOOK - STAINED GLASS. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dark, sacred, contemplative.\n- COLOR PALETTE: Navy, deep blue, cyan, pale gold, red sparks.\n- SHADOWS AND BLACKS: Dark navy.\n- HIGHLIGHTS: Cyan-white glowing windows.\n- CONTRAST AND SATURATION: High contrast, medium-high saturation.\n- PATINA: Haze, soft image.\n- LIGHT QUALITY AND DIRECTION: Subject partly silhouetted, face in soft shadow with a cool rim from behind and a soft top beam.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Jewel-colored bokeh windows in the background ONLY if the architecture allows; otherwise use jewel-toned color accents in the light.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'searchlight',
    name: 'Searchlight',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/searchlight.webp',
    descriptionEs: 'Haz de búsqueda desde arriba; silueta con borde de luz sobre negro.',
    descriptionEn: 'Black night, tension.',
    prompt:
      'LOOK - SEARCHLIGHT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Black night, tension.\n- COLOR PALETTE: Black, navy, pale cyan-white.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Pale cyan-white beam.\n- CONTRAST AND SATURATION: Extreme contrast, low saturation.\n- PATINA: Haze, fine grain.\n- LIGHT QUALITY AND DIRECTION: One hard searchlight beam from high above cutting diagonally through haze, sweeping slowly (video); the subject almost a silhouette with an edge of light.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Scene falls toward black; silhouettes of the main elements stay readable.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'explosion',
    name: 'Explosion',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/explosion.webp',
    descriptionEs: 'Fuego naranja a un lado y backlight cian al otro; caos dramático.',
    descriptionEn: 'Dramatic, chaotic.',
    prompt:
      'LOOK - EXPLOSION. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dramatic, chaotic.\n- COLOR PALETTE: Teal, cyan, orange, yellow, black.\n- SHADOWS AND BLACKS: Teal-black.\n- HIGHLIGHTS: Yellow-orange fire, cyan-white backlight.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Smoke, haze, volumetric rays, glow.\n- LIGHT QUALITY AND DIRECTION: Subject almost silhouetted with a hot rim; fire light flickers and pulses from one side; cool teal-cyan backlight from the other.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Smoke and volumetric rays in available depth. Light only: no visible fire, debris or explosion unless the scene already has it.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'muzzle-flash',
    name: 'Muzzle flash',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/muzzle-flash.webp',
    descriptionEs: 'Destellos blancos súbitos desde fuera de cuadro; acción cruda.',
    descriptionEn: 'Gritty, raw action.',
    prompt:
      'LOOK - MUZZLE FLASH. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Gritty, raw action.\n- COLOR PALETTE: Mint green, olive, warm amber, brown, white.\n- SHADOWS AND BLACKS: Warm brown-black.\n- HIGHLIGHTS: Flashes blown to white.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: 1990s 35mm film, grain, slight smear.\n- LIGHT QUALITY AND DIRECTION: Warm dim light with split-second bursts of bright white-yellow from off-screen (video) or one frozen burst (still). Light only: no weapon, nothing visible.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Surfaces lean dirty mint and pale green; a warm tungsten glow at the top only if fixtures plausibly exist.',
  },
  {
    id: 'laser-lights',
    name: 'Laser lights',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/laser-lights.webp',
    descriptionEs: 'Línea láser roja a la altura de los ojos; azul oscuro y misterio.',
    descriptionEn: 'Dark, flat, mysterious.',
    prompt:
      'LOOK - LASER LIGHTS. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dark, flat, mysterious.\n- COLOR PALETTE: Navy, dark blue, red laser line, faint magenta.\n- SHADOWS AND BLACKS: Lifted murky purple-grey.\n- HIGHLIGHTS: Magenta-red, only on the line.\n- CONTRAST AND SATURATION: Very low contrast, low saturation except the laser.\n- PATINA: 16mm feel, heavy grain, soft murky image, slight vignette.\n- LIGHT QUALITY AND DIRECTION: Dim blue ambient on the subject and a red glow wherever the laser touches the skin.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- A thin red laser line sweeping across the frame at eye and nose height; light only.\n\nATMOSPHERE RULE: haze, volumetric light and particles, if used, stay present and moving for the entire duration (video), never static. In stills, keep them subtle and consistent with the scene.',
  },
  {
    id: 'blacklight-uv',
    name: 'Blacklight (UV)',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/blacklight-uv.webp',
    descriptionEs: 'Luz ultravioleta; blancos fluorescentes y piel violeta.',
    descriptionEn: 'Dark club, electric.',
    prompt:
      'LOOK - BLACKLIGHT (UV). Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dark club, electric.\n- COLOR PALETTE: Ultramarine, violet, neon orange, magenta, glowing white.\n- SHADOWS AND BLACKS: Pure black.\n- HIGHLIGHTS: Glowing whites and neon.\n- CONTRAST AND SATURATION: High contrast, extreme saturation.\n- PATINA: Glow, slight bloom.\n- LIGHT QUALITY AND DIRECTION: Ultraviolet blacklight: skin purple-blue, light or white materials glow brightly.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Only existing white or light-colored materials glow; do not add neon paint, prints or signs that are not there.',
  },
  {
    id: 'bi-color-light',
    name: 'Bi-color light',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/bi-color-light.webp',
    descriptionEs: 'Clave magenta desde un lado y azul profundo desde el otro; fiesta nocturna.',
    descriptionEn: 'Night party, cool and seductive.',
    prompt:
      'LOOK - BI-COLOR LIGHT. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Night party, cool and seductive.\n- COLOR PALETTE: Royal blue, cyan, magenta-red, orange specks.\n- SHADOWS AND BLACKS: Dark navy.\n- HIGHLIGHTS: Blue-lavender, magenta-red on the skin.\n- CONTRAST AND SATURATION: Medium-high contrast, high saturation.\n- PATINA: Shallow depth of field, sparkly bokeh.\n- LIGHT QUALITY AND DIRECTION: Magenta-red key from one side, deep blue light from the other and on the background.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Glittering blue, cyan and orange bokeh sparkles only where there is background depth or lights.',
  },
  {
    id: 'mixed-colour-temperature',
    name: 'Mixed colour temperature',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/mixed-colour-temperature.webp',
    descriptionEs:
      'Sol cálido por la izquierda y sombra teal por la derecha; contraste de temperatura.',
    descriptionEn: 'Warm afternoon, stylish.',
    prompt:
      'LOOK - MIXED COLOUR TEMPERATURE. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Warm afternoon, stylish.\n- COLOR PALETTE: Orange, rust, golden yellow, teal, deep green.\n- SHADOWS AND BLACKS: Reddish brown.\n- HIGHLIGHTS: Warm cream-yellow.\n- CONTRAST AND SATURATION: High contrast, high saturation.\n- PATINA: Rich warm 35mm.\n- LIGHT QUALITY AND DIRECTION: Warm golden sunlight on one side of the subject with a cool teal fill on the other.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Warm sun through curtains or a hard sun streak on the floor ONLY if there is a window or opening; otherwise keep the warm-versus-cool split in the light itself.',
  },
  {
    id: 'cast-shadow',
    name: 'Cast shadow',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/cast-shadow.webp',
    descriptionEs: 'Luz dura cálida que proyecta la sombra del sujeto en la pared; expresionista.',
    descriptionEn: 'Warm, expressionist.',
    prompt:
      'LOOK - CAST SHADOW. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Warm, expressionist.\n- COLOR PALETTE: Golden amber, honey, burnt orange, dark brown, black.\n- SHADOWS AND BLACKS: Near-black warm.\n- HIGHLIGHTS: Golden peach.\n- CONTRAST AND SATURATION: High contrast, high warm saturation.\n- PATINA: Warm grain.\n- LIGHT QUALITY AND DIRECTION: A single hard warm low light from one side, with the edges of the frame falling to dark brown-black.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- A large hard shadow of the subject on a back wall ONLY if a wall is behind; otherwise rely on face and body shadows.',
  },
  {
    id: 'city-bokeh',
    name: 'City bokeh',
    set: 1,
    draft: false,
    thumb: '/assets/lighting/city-bokeh.webp',
    descriptionEs: 'Atardecer frío con bokeh urbano rosa y rojo; melancolía.',
    descriptionEn: 'Cool dusk, melancholic.',
    prompt:
      'LOOK - CITY BOKEH. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Cool dusk, melancholic.\n- COLOR PALETTE: Slate blue, grey, muted teal, pink-red, white.\n- SHADOWS AND BLACKS: Slightly lifted blue-grey.\n- HIGHLIGHTS: Cool white.\n- CONTRAST AND SATURATION: Medium contrast, low saturation.\n- PATINA: Soft, natural, fine grain.\n- LIGHT QUALITY AND DIRECTION: Soft cool dusk light on the subject.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Heavily defocused cool background with round pink, red and white bokeh lights if the scene has distant lights or depth.',
  },
  {
    id: 'bloom-halation',
    name: 'Bloom / halation',
    set: 1,
    draft: true,
    thumb: '/assets/lighting/bloom-halation.webp',
    descriptionEs: 'Atardecer frío con bokeh y halación; bloom suave en las luces.',
    descriptionEn: 'Dreamy, glowing, soft and nostalgic.',
    prompt:
      'LOOK - BLOOM / HALATION. Use this as a lighting DIRECTION, not a recipe. Adapt it to the actual scene.\n\nTRANSFERABLE (always apply):\n- MOOD AND EXPOSURE: Dreamy, glowing, soft and nostalgic.\n- COLOR PALETTE: Warm cream, soft amber, gentle pastel tones, skin warm and glowing.\n- SHADOWS AND BLACKS: Softly lifted blacks with a faint haze.\n- HIGHLIGHTS: Strongly blooming whites with warm-red halation edges.\n- CONTRAST AND SATURATION: Low-medium contrast, medium-low saturation.\n- PATINA: Film halation, soft diffusion, fine grain.\n- LIGHT QUALITY AND DIRECTION: Soft light on the face with a glowing halo around bright edges, a subtle warm-red halation fringe around highlights and hair.\n\nCONDITIONAL (only if physically plausible in the scene; otherwise skip and approximate with existing sources):\n- Every bright area blooms softly into its surroundings, a gentle luminous veil; halation appears only around bright sources or highlights already present.',
  },
  {
    id: 'high-key',
    name: 'High key',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/high-key.webp',
    descriptionEs:
      'Luz frontal suave y amplia; casi sin sombras, blancos aireados y look comercial.',
    descriptionEn:
      'Bright, even, almost shadowless light from large soft frontal sources and strong fill.',
    prompt:
      'LOOK - HIGH KEY: Bright, even, almost shadowless light from large soft frontal sources and strong fill. Low contrast, airy whites, clean bright skin. The existing setting becomes luminous, with minimal shadows under the chin and on surrounding surfaces, for a crisp commercial look.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'low-key',
    name: 'Low key',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/low-key.webp',
    descriptionEs:
      'Escena en sombra profunda con una clave suave sobre el rostro; fondo casi negro y alto contraste.',
    descriptionEn: 'The existing setting falls mostly into deep shadow.',
    prompt:
      "LOOK - LOW KEY: The existing setting falls mostly into deep shadow. One soft key light creates a pool of light on the subject's face and upper body. High contrast, moody near-black background, only faint shapes of the surroundings.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.",
  },
  {
    id: 'rembrandt',
    name: 'Rembrandt',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/rembrandt.webp',
    descriptionEs:
      'Clave alta a 45 grados con triángulo de luz bajo el ojo; retrato pintoresco y contrastado.',
    descriptionEn: 'One key light high and about 45 degrees to the side.',
    prompt:
      'LOOK - REMBRANDT: One key light high and about 45 degrees to the side. The far cheek stays in shadow with a small bright triangle beneath the eye on that side. Little fill, rich moody contrast, painterly warm tones, a darker background.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'butterfly-paramount',
    name: 'Butterfly (Paramount)',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/butterfly-paramount.webp',
    descriptionEs:
      'Clave alta y frontal; sombra en mariposa bajo la nariz y look glamuroso de Hollywood.',
    descriptionEn: 'The key light high and directly in front of the face.',
    prompt:
      'LOOK - BUTTERFLY (PARAMOUNT): The key light high and directly in front of the face. A small butterfly-shaped shadow beneath the nose, soft shadows under chin and cheekbones. Glamorous classic Hollywood portrait look, soft falloff behind the subject.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'split',
    name: 'Split',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/split.webp',
    descriptionEs:
      'Luz dura lateral a 90 grados que ilumina media cara; división vertical nítida y alto drama.',
    descriptionEn: "A hard side light at 90 degrees illuminating about half of the subject's face.",
    prompt:
      "LOOK - SPLIT: A hard side light at 90 degrees illuminating about half of the subject's face. The other half falls into darkness with a sharp vertical division. Dramatic high contrast, dark surroundings.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.",
  },
  {
    id: 'loop',
    name: 'Loop',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/loop.webp',
    descriptionEs:
      'Clave suave ligeramente fuera de eje; sombra de nariz en bucle y modelado natural.',
    descriptionEn: 'A soft key slightly off-axis and just above eye level.',
    prompt:
      'LOOK - LOOP: A soft key slightly off-axis and just above eye level. A small nose shadow looping toward the cheek, gentle fill, soft modelling across the face. Natural and flattering.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'broad',
    name: 'Broad',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/broad.webp',
    descriptionEs:
      'Ilumina el lado del rostro que mira a cámara; lado ancho luminoso y sombra suave al fondo.',
    descriptionEn: 'Light the side of the face turned toward the camera.',
    prompt:
      'LOOK - BROAD: Light the side of the face turned toward the camera. The broader visible side is bright, gentle shadow on the far side. Soft open feel, natural warm portrait tones.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'short',
    name: 'Short',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/short.webp',
    descriptionEs:
      'Ilumina el lado del rostro que se aleja de cámara; look esculpido y más profundo.',
    descriptionEn: 'Light the side of the face turned away from the camera.',
    prompt:
      'LOOK - SHORT: Light the side of the face turned away from the camera. The nearer side falls into soft shadow. Sculpted, moodier portrait look with greater depth and a slightly darker tone in the surroundings.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'chiaroscuro',
    name: 'Chiaroscuro',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/chiaroscuro.webp',
    descriptionEs:
      'Contraste extremo de viejo maestro: rostro y manos tallados en la oscuridad con una sola luz.',
    descriptionEn: 'Painterly, very high contrast.',
    prompt:
      "LOOK - CHIAROSCURO: Painterly, very high contrast. Carve the subject's face and hands out of deep darkness with one strong directional light. Rich warm highlights and deep blacks, the surroundings nearly disappearing into shadow like an old-master painting.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.",
  },
  {
    id: 'silhouette',
    name: 'Silhouette',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/silhouette.webp',
    descriptionEs:
      'Fondo brillante y sujeto sin luz frontal; silueta oscura con apenas detalle facial.',
    descriptionEn: 'The background is lit brightly and evenly, almost white.',
    prompt:
      'LOOK - SILHOUETTE: The background is lit brightly and evenly, almost white. The subject is unlit from the front so body and face read as a dark silhouette, with only a faint hint of facial detail. Preserve the original outline and movements.\nGUARD: Only brighten the background using areas that already exist as background (sky, wall, window, open space). Do not add a window or backdrop.',
  },
  {
    id: 'rim-backlight',
    name: 'Rim / Backlight',
    set: 2,
    draft: true,
    thumb: '/assets/lighting/rim-backlight.webp',
    descriptionEs:
      'Contraluz desde atrás que dibuja un borde brillante en pelo, hombros y contornos; rostro más suave.',
    descriptionEn:
      'A light from behind the subject that traces a clean bright edge along hair, shoulders and contours, separating the subject from a darker background.',
    prompt:
      'LOOK - RIM / BACKLIGHT: A light from behind the subject that traces a clean bright edge along hair, shoulders and contours, separating the subject from a darker background. The front of the face stays softer and in gentle shadow or soft fill.\nGUARD: The backlight comes from a plausible off-screen or existing source behind the subject. Do not add visible lamps or windows.',
  },
  {
    id: 'hard-light',
    name: 'Hard light',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/hard-light.webp',
    descriptionEs: 'Fuente pequeña y directa; sombras nítidas y modelado direccional fuerte.',
    descriptionEn: 'A small, direct, unfiltered light source.',
    prompt:
      'LOOK - HARD LIGHT: A small, direct, unfiltered light source. Crisp sharp-edged shadows from the subject onto nearby surfaces, high clarity, punchy contrast and strong directional modelling.\nGUARD: Shadows come only from the subject and from objects that already exist.',
  },
  {
    id: 'soft-light',
    name: 'Soft light',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/soft-light.webp',
    descriptionEs: 'Fuente grande y difusa que envuelve al sujeto; sombras suaves y piel natural.',
    descriptionEn: 'A large diffused source that wraps around the subject.',
    prompt:
      'LOOK - SOFT LIGHT: A large diffused source that wraps around the subject. Shadows roll off very gently, low contrast, soft natural skin highlights. Skin texture stays intact and the setting is softly lit for a calm, elegant look.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'bounce',
    name: 'Bounce',
    set: 2,
    draft: true,
    thumb: '/assets/lighting/bounce.webp',
    descriptionEs:
      'Luz rebotada desde una superficie existente para rellenar sombras sin inventar fuentes.',
    descriptionEn:
      'Soft, indirect light bounced from a large nearby surface (white wall, ceiling or reflector) into the subject: wraparound fill, gentle shadows, soft warm-neutral catchlights, an open natural look.',
    prompt:
      'LOOK - BOUNCE: Soft, indirect light bounced from a large nearby surface (white wall, ceiling or reflector) into the subject: wraparound fill, gentle shadows, soft warm-neutral catchlights, an open natural look.\nGUARD: The bounce color follows the surface it would come from in the scene; do not add a visible reflector or panel.',
  },
  {
    id: 'top-light',
    name: 'Top light',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/top-light.webp',
    descriptionEs:
      'Luz única cenital; cabeza y hombros iluminados, cuencas en sombra, mood de interrogatorio.',
    descriptionEn: 'A single light directly overhead.',
    prompt:
      'LOOK - TOP LIGHT: A single light directly overhead. The top of the head or existing headwear and the shoulders brighten. Eye sockets and sides fall into shadow, strong shadows under nose and chin, an interrogation-room mood.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'under-lighting',
    name: 'Under lighting',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/under-lighting.webp',
    descriptionEs: 'Luz desde abajo hacia el rostro; sombras ascendentes y ambiente inquietante.',
    descriptionEn: 'Light from below pointing upward at the face.',
    prompt:
      'LOOK - UNDER LIGHTING: Light from below pointing upward at the face. Shadows throw upward over the eyes and forehead. Warm uplight and long upward shadows on nearby surfaces for an eerie campfire-story or horror look.\nGUARD: Upward shadows on background surfaces only where such surfaces exist.',
  },
  {
    id: 'golden-hour',
    name: 'Golden hour',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/golden-hour.webp',
    descriptionEs: 'Sol bajo y cálido lateral; sombras largas, piel dorada y grado ámbar.',
    descriptionEn: 'Low, warm sunlight entering the scene from the side.',
    prompt:
      'LOOK - GOLDEN HOUR: Low, warm sunlight entering the scene from the side. Long soft shadows, golden skin, warm highlights in hair. A slight lens glow and a rich amber grade while preserving the original setting.\nGUARD: If the scene is indoors, imply the sun as a warm directional light from an existing or off-screen opening.',
  },
  {
    id: 'blue-hour',
    name: 'Blue hour',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/blue-hour.webp',
    descriptionEs: 'Luz ambiente fría de crepúsculo; azules profundos y exposición reducida.',
    descriptionEn: 'Cool ambient dusk light, no hard sunlight.',
    prompt:
      'LOOK - BLUE HOUR: Cool ambient dusk light, no hard sunlight. Deep soft blues in the surroundings, gentle cool daylight on the face. A calm melancholic mood and slightly reduced exposure.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'day-for-night',
    name: 'Day-for-night',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/day-for-night.webp',
    descriptionEs:
      'Grado azul profundo y exposición baja para simular noche; tonos lunares desaturados.',
    descriptionEn: 'Grade the scene deep blue and lower the exposure to suggest night.',
    prompt:
      'LOOK - DAY-FOR-NIGHT: Grade the scene deep blue and lower the exposure to suggest night. Cool moonlit tones, a darkened background, deep shadows, desaturated cooler skin. Keep enough detail to read the subject and the original action.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/moonlight.webp',
    descriptionEs: 'Clave azul-plata fría y suave; entorno oscuro y atmósfera nocturna tranquila.',
    descriptionEn:
      'A cool, soft, low-level blue-silver key, as if moonlight entered from outside the frame.',
    prompt:
      'LOOK - MOONLIGHT: A cool, soft, low-level blue-silver key, as if moonlight entered from outside the frame. Gentle shadows, dark surroundings, a quiet nocturnal atmosphere, the face softly readable.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'window-light',
    name: 'Window light',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/window-light.webp',
    descriptionEs: 'Luz natural y suave de ventana lateral; caída gradual y feel documental.',
    descriptionEn: 'Natural soft side light as if from one large window.',
    prompt:
      'LOOK - WINDOW LIGHT: Natural soft side light as if from one large window. It falls off across the face and body, leaving the other side in gentle shadow. Realistic daylight and a calm documentary feel.\nGUARD: Use an existing window if there is one; otherwise imply it off-screen. Do not add a visible window or its frame shadows.',
  },
  {
    id: 'practical',
    name: 'Practical',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/practical.webp',
    descriptionEs: 'Pools cálidos de tungsteno como lámparas de casa; zonas oscuras entre ellos.',
    descriptionEn:
      'Warm pools of tungsten light across the subject and surfaces, with darker spaces between them, motivated by household lamps.',
    prompt:
      'LOOK - PRACTICAL: Warm pools of tungsten light across the subject and surfaces, with darker spaces between them, motivated by household lamps.\nGUARD: Use existing lamps where present; otherwise keep the implied sources off-screen. Do not add lamps or other props.',
  },
  {
    id: 'firelight-candlelight',
    name: 'Firelight / Candlelight',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/firelight-candlelight.webp',
    descriptionEs: 'Luz naranja cálida y baja que parpadea como fuego; entorno oscuro e íntimo.',
    descriptionEn:
      'A warm, low orange light from below and to one side, flickering gently (video) like firelight or candlelight across the face and nearby surfaces.',
    prompt:
      'LOOK - FIRELIGHT / CANDLELIGHT: A warm, low orange light from below and to one side, flickering gently (video) like firelight or candlelight across the face and nearby surfaces. Deep dark surroundings and an intimate warm mood.\nGUARD: Do not add visible flames or candles unless the scene already has them.',
  },
  {
    id: 'venetian-blinds',
    name: 'Venetian blinds',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/venetian-blinds.webp',
    descriptionEs: 'Franjas duras de luz y sombra como persianas venecianas; contraste film-noir.',
    descriptionEn:
      'Film-noir contrast and a smoky, dark mood, with directional hard light from one side.',
    prompt:
      'LOOK - VENETIAN BLINDS: Film-noir contrast and a smoky, dark mood, with directional hard light from one side.\nGUARD: Parallel slats of light and shadow ONLY if the scene has blinds, shutters or slatted openings. Otherwise do NOT draw stripes: reproduce the film-noir contrast, hardness and smoky mood with plain hard directional light and dark shadow. Preserve the original geometry.',
  },
  {
    id: 'dappled-gobo',
    name: 'Dappled / Gobo',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/dappled-gobo.webp',
    descriptionEs:
      'Luz quebrada con patrones de hojas; manchas suaves que se mueven sobre el rostro.',
    descriptionEn:
      'Broken, patterned sunlight feel: soft irregular patches of light and shade across the subject and surfaces, natural movement (video).',
    prompt:
      'LOOK - DAPPLED / GOBO: Broken, patterned sunlight feel: soft irregular patches of light and shade across the subject and surfaces, natural movement (video).\nGUARD: Leaf-shaped patterns ONLY if there is foliage or an outdoor setting with trees. Otherwise use soft irregular broken light with no recognizable shapes. Do not add foliage.',
  },
  {
    id: 'volumetric-god-rays',
    name: 'Volumetric (God rays)',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/volumetric-god-rays.webp',
    descriptionEs: 'Bruma ligera con haces visibles en diagonal; profundidad soñadora.',
    descriptionEn:
      'A light atmospheric haze with bright visible beams cutting diagonally through the scene, as if from an off-screen opening.',
    prompt:
      'LOOK - VOLUMETRIC (GOD RAYS): A light atmospheric haze with bright visible beams cutting diagonally through the scene, as if from an off-screen opening. Rays glow in the haze and catch shoulders and headwear. Dreamy depth.\nGUARD: Do not add a window or props. In small or closed spaces, keep the rays subtle and soft.',
  },
  {
    id: 'overcast-flat',
    name: 'Overcast / Flat',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/overcast-flat.webp',
    descriptionEs: 'Luz difusa de cielo gris, muy uniforme y sin dramatismo; color desaturado.',
    descriptionEn: 'Diffused grey-sky daylight with little direction or drama.',
    prompt:
      'LOOK - OVERCAST / FLAT: Diffused grey-sky daylight with little direction or drama. Very even, soft, almost shadowless light. Muted desaturated colors and a cool neutral grade for a quiet realistic look.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.',
  },
  {
    id: 'neon',
    name: 'Neon',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/neon.webp',
    descriptionEs:
      'Neón saturado naranja-rojo y azul eléctrico desde lados opuestos; reflejos de club.',
    descriptionEn:
      'Saturated neon color: warm orange-red light from one side and electric blue light from the other.',
    prompt:
      'LOOK - NEON: Saturated neon color: warm orange-red light from one side and electric blue light from the other. Colored reflections across the subject and nearby surfaces, rich dark shadows, a night-club mood.\nGUARD: Keep the light sources off-screen. Do not add neon signs or tubes.',
  },
  {
    id: 'teal-and-orange',
    name: 'Teal & Orange',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/teal-and-orange.webp',
    descriptionEs:
      'Clave naranja cálida sobre la piel contra sombras teal; contraste complementario cinematográfico.',
    descriptionEn:
      "A warm orange key on the subject's skin against cool teal shadows and a teal-toned background.",
    prompt:
      "LOOK - TEAL & ORANGE: A warm orange key on the subject's skin against cool teal shadows and a teal-toned background. Strong complementary contrast, a cinematic teal-and-orange grade, the original setting and natural skin texture retained.\nGUARD: adapt to the scene; do not add objects or light sources that are not plausible here.",
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    set: 2,
    draft: true,
    thumb: '/assets/lighting/monochrome.webp',
    descriptionEs: 'Un solo tono domina la escena: luz y color reducidos a una gama monocroma.',
    descriptionEn:
      'A black-and-white or near single-hue treatment: strong tonal separation, rich blacks, clean highlights and a controlled contrast curve, so the image reads through light and shape more than color.',
    prompt:
      'LOOK - MONOCHROME: A black-and-white or near single-hue treatment: strong tonal separation, rich blacks, clean highlights and a controlled contrast curve, so the image reads through light and shape more than color.\nGUARD: Choose either true black-and-white or a single tinted hue; do not mix. Skin texture stays natural.',
  },
  {
    id: 'screen-glow',
    name: 'Screen glow',
    set: 2,
    draft: false,
    thumb: '/assets/lighting/screen-glow.webp',
    descriptionEs:
      'Resplandor azul-blanco frío desde fuera de cuadro, como una pantalla; entorno oscuro.',
    descriptionEn:
      'A cool blue-white glow on face and hands, as if from a screen just outside the frame, flickering softly (video).',
    prompt:
      'LOOK - SCREEN GLOW: A cool blue-white glow on face and hands, as if from a screen just outside the frame, flickering softly (video). The rest of the scene stays dark.\nGUARD: Do not add a screen or device.',
  },
];
