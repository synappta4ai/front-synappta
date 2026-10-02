/**
 * Slides del carrusel del hero. PARA AGREGAR UN VIDEO O IMAGEN: sumar un
 * objeto a este array. Los videos aceptan `poster` y `duration` (ms);
 * sin `duration`, el carrusel espera al fin del video (con red de 15s).
 */
export interface HeroSlide {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  alt: string;
  duration?: number;
}

export const HERO_SLIDES: readonly HeroSlide[] = [
  {
    type: 'image',
    src: 'Media/Image header.png',
    alt: 'Protagonista de una pieza audiovisual de Synappta',
  },
];
