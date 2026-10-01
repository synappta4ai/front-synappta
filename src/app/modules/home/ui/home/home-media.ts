/**
 * Medios y marca del landing. PUNTO ÚNICO DE CAMBIO: cuando existan los
 * assets reales, reemplazar solo las rutas de este archivo.
 * - Videos: poner el .mp4 en public/videos/ y sumar <source> donde indica
 *   logo-media.component.html. El poster se muestra mientras tanto.
 * - Imágenes: cualquier formato en public/placeholders/ (o la carpeta que
 *   prefieras) manteniendo width/height proporcionales al uso.
 */
export interface WorkSlide {
  src: string;
  title: string;
  caption: string;
  width: number;
  height: number;
}

export const HOME_MEDIA = {
  logoTitle: 'assets/img/sinappta-title.png',
  logoMark: 'assets/img/sinappta-logo-sqared.png',
  heroVideoPoster: 'placeholders/showreel-16x9.svg',
  workSlides: [
    {
      src: 'placeholders/portrait-4x5.svg',
      title: 'Pieza 01',
      caption: 'SET — 4:5',
      width: 800,
      height: 1000,
    },
    {
      src: 'placeholders/wide-3x2.svg',
      title: 'Pieza 02',
      caption: 'RODAJE — 3:2',
      width: 1200,
      height: 800,
    },
    {
      src: 'placeholders/showreel-16x9.svg',
      title: 'Pieza 03',
      caption: 'SHOWREEL — 16:9',
      width: 1280,
      height: 720,
    },
  ],
} as const;
