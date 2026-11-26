import { ChangeDetectionStrategy, Component } from '@angular/core';

import { GpuPanelComponent } from '@modules/gpu/ui/gpu-panel/gpu-panel.component';

/**
 * `/admin/gpu` — gestión de la GPU y de los modelos del worker.
 *
 * Reutiliza el panel "Tu GPU" a propósito: es la misma API (`/worker/models`,
 * `/gpu/workers`, `/gpu/pairing-code`) y el mismo estado. Antes esta página
 * duplicaba la vista con dos llamadas en un `forkJoin` que, sin worker central
 * configurado, morían en `EMPTY` y no emitían nunca: el panel quedaba con
 * guiones y 0/0 modelos aunque la GPU emparejada estuviera reportando todo.
 *
 * Acá se ven los modelos del worker con su estado de pesos (descargar,
 * cancelar, borrar), las GPUs emparejadas con VRAM/disco y qué modelos entran
 * en cada una, y el emparejamiento vive en un modal con el código de 6 dígitos.
 */
@Component({
  selector: 'app-admin-gpu',
  imports: [GpuPanelComponent],
  template: '<app-gpu-panel />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGpuComponent {}
